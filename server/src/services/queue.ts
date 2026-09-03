import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { products } from "../db/schema.js";
import { searchAndVerifyProduct } from "./productSearch.js";
import { touchJob, incrementProcessed, getJob, recomputeProcessedCount } from "./jobService.js";
import { ProviderNotConfiguredError } from "./searchProviders/types.js";
import { env } from "../env.js";
import { planNextPhase, type PhaseItem, type PhaseNumber } from "./phaseEngine.js";
import { hasQuotaFor } from "./quotaGovernor.js";
import { getCachedResult } from "./searchCache.js";
import type { DomainFilterMode } from "./sourceTier.js";

type RunnerState = "running" | "paused" | "cancelled" | "idle";

class JobRunner {
  state: RunnerState = "idle";
  private resumeWaiters: (() => void)[] = [];

  pause() {
    if (this.state === "running") this.state = "paused";
  }

  resume() {
    if (this.state === "paused") {
      this.state = "running";
      this.resumeWaiters.forEach((fn) => fn());
      this.resumeWaiters = [];
    }
  }

  cancel() {
    this.state = "cancelled";
    this.resumeWaiters.forEach((fn) => fn());
    this.resumeWaiters = [];
  }

  private waitIfPaused(): Promise<void> {
    if (this.state !== "paused") return Promise.resolve();
    return new Promise((resolve) => this.resumeWaiters.push(resolve));
  }

  async waitForRunnable(): Promise<boolean> {
    // returns false if cancelled
    while (this.state === "paused") {
      await this.waitIfPaused();
    }
    return this.state !== "cancelled";
  }
}

const runners = new Map<string, JobRunner>();

function getRunner(jobId: string): JobRunner {
  let r = runners.get(jobId);
  if (!r) {
    r = new JobRunner();
    runners.set(jobId, r);
  }
  return r;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processOne(jobId: string, productId: string, runner: JobRunner) {
  const product = db.select().from(products).where(eq(products.id, productId)).get();
  if (!product) return;

  db.update(products)
    .set({ status: "searching", attempts: product.attempts + 1, updatedAt: new Date().toISOString() })
    .where(eq(products.id, productId))
    .run();

  try {
    const outcome = await searchAndVerifyProduct(
      { id: product.id, styleCode: product.styleCode, colour: product.colour, category: product.category },
      { useCache: true }
    );

    db.update(products)
      .set({
        status: outcome.status,
        confidence: outcome.confidence,
        imageUrl: outcome.imageUrl,
        sourceUrl: outcome.sourceUrl,
        sourceName: outcome.sourceName,
        verificationNotes: JSON.stringify(outcome.candidates[0]?.evidence ?? []),
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, productId))
      .run();
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      runner.cancel();
      touchJob(jobId, {
        status: "failed",
      });
      db.update(products)
        .set({ status: "failed", errorMessage: err.message, updatedAt: new Date().toISOString() })
        .where(eq(products.id, productId))
        .run();
      return;
    }
    db.update(products)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, productId))
      .run();
  } finally {
    incrementProcessed(jobId);
  }
}

async function runWorkerPool(jobId: string, productIds: string[], concurrency: number, runner: JobRunner) {
  let index = 0;
  const next = (): string | null => (index < productIds.length ? productIds[index++] : null);

  const worker = async () => {
    while (true) {
      const runnable = await runner.waitForRunnable();
      if (!runnable) return;
      const id = next();
      if (id === null) return;
      await processOne(jobId, id, runner);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
}

async function processPhaseItem(
  jobId: string,
  productId: string,
  targetPhase: PhaseNumber,
  requiredQueries: number,
  domainFilterMode: DomainFilterMode,
  officialDomain: string | null,
  runner: JobRunner
) {
  const product = db.select().from(products).where(eq(products.id, productId)).get();
  if (!product) return;

  db.update(products)
    .set({ status: "searching", attempts: product.attempts + 1, updatedAt: new Date().toISOString() })
    .where(eq(products.id, productId))
    .run();

  try {
    const outcome = await searchAndVerifyProduct(
      { id: product.id, styleCode: product.styleCode, colour: product.colour, category: product.category },
      { useCache: true, maxQueries: requiredQueries, domainFilterMode, officialDomain }
    );
    const stillNotFound = outcome.status === "not_found";

    db.update(products)
      .set({
        status: outcome.status,
        confidence: outcome.confidence,
        imageUrl: outcome.imageUrl,
        sourceUrl: outcome.sourceUrl,
        sourceName: outcome.sourceName,
        verificationNotes: JSON.stringify(outcome.candidates[0]?.evidence ?? []),
        errorMessage: null,
        // Still not found -> record the phase just attempted so the plan can
        // decide whether to escalate; found -> done, no more auto-retries.
        searchPhase: stillNotFound ? targetPhase : 3,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, productId))
      .run();
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      runner.cancel();
      touchJob(jobId, { status: "failed" });
      db.update(products)
        .set({ status: "failed", searchPhase: 3, errorMessage: err.message, updatedAt: new Date().toISOString() })
        .where(eq(products.id, productId))
        .run();
      return;
    }
    // Errors (as opposed to a clean "not found") are excluded from further
    // automatic phase escalation - fixable via the existing "Retry Failed" flow.
    db.update(products)
      .set({
        status: "failed",
        searchPhase: 3,
        errorMessage: err instanceof Error ? err.message : String(err),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, productId))
      .run();
  }
}

type PhaseRunResult = "cancelled" | "quota" | "completed";

/**
 * Runs the whole job through the three-phase escalating search strategy
 * (phaseEngine.ts): always finishes the current phase across every item
 * before advancing to the next, and stops cleanly - without touching
 * whatever it hasn't reached yet - the instant the daily search-provider
 * quota is exhausted, so a later resume can pick up exactly where it left
 * off using the existing cache.
 */
async function runPhaseAwareJob(
  jobId: string,
  concurrency: number,
  domainFilterMode: DomainFilterMode,
  officialDomain: string | null,
  runner: JobRunner
): Promise<PhaseRunResult> {
  while (true) {
    const runnable = await runner.waitForRunnable();
    if (!runnable) return "cancelled";

    const rows = db.select().from(products).where(eq(products.jobId, jobId)).all();
    const items: PhaseItem[] = rows.map((r) => ({ id: r.id, status: r.status, searchPhase: r.searchPhase }));
    const plan = planNextPhase(items);
    if (plan.done) return "completed";

    const rowById = new Map(rows.map((r) => [r.id, r]));
    const queueIds = plan.eligibleIds;
    let cursor = 0;
    let quotaExhausted = false;

    const worker = async () => {
      while (true) {
        if (quotaExhausted) return;
        const runnableNow = await runner.waitForRunnable();
        if (!runnableNow) return;
        const id = queueIds[cursor++];
        if (id === undefined) return;
        const row = rowById.get(id)!;

        // A cache hit costs zero provider quota, so only gate on quota for
        // items that would actually have to reach the live provider.
        const cached = getCachedResult(row.styleCode, row.colour);
        if (!cached && !hasQuotaFor(plan.requiredQueries)) {
          quotaExhausted = true;
          cursor = queueIds.length; // stop handing out further work this pass
          return;
        }

        await processPhaseItem(
          jobId,
          id,
          plan.targetPhase as PhaseNumber,
          plan.requiredQueries,
          domainFilterMode,
          officialDomain,
          runner
        );
      }
    };

    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    recomputeProcessedCount(jobId);

    if (runner.state === "cancelled") return "cancelled";
    if (quotaExhausted) return "quota";
    // Otherwise loop again - the plan may now advance to the next phase.
  }
}

export async function startJob(
  jobId: string,
  options: { productIds?: string[]; retryFailedOnly?: boolean } = {}
) {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");

  const runner = getRunner(jobId);
  if (runner.state === "running") return; // already running
  runner.state = "running";

  if ((options.productIds && options.productIds.length > 0) || options.retryFailedOnly) {
    // Manual "Search Selected" / "Retry Failed" overrides: bypass the phase
    // governor entirely and behave exactly as before (all query variants at
    // once, ignoring the daily quota gate) since the user explicitly asked
    // for these specific items right now.
    let targetProducts;
    if (options.productIds && options.productIds.length > 0) {
      targetProducts = options.productIds
        .map((id) => db.select().from(products).where(eq(products.id, id)).get())
        .filter(Boolean) as (typeof products.$inferSelect)[];
    } else {
      targetProducts = db
        .select()
        .from(products)
        .where(eq(products.jobId, jobId))
        .all()
        .filter((p) => p.status === "failed" || p.status === "not_found");
    }

    const productIds = targetProducts.map((p) => p.id);
    if (productIds.length === 0) {
      touchJob(jobId, { status: "completed" });
      runner.state = "idle";
      return;
    }

    touchJob(jobId, {
      status: "running",
      pauseReason: null,
      totalProducts: job.totalProducts || productIds.length,
    });

    // Run asynchronously - caller does not await full completion, it polls job status.
    void (async () => {
      try {
        await runWorkerPool(jobId, productIds, job.concurrency || env.SEARCH_CONCURRENCY, runner);
      } finally {
        const finalRunner = getRunner(jobId);
        if (finalRunner.state === "cancelled") {
          const current = getJob(jobId);
          if (current?.status !== "failed") touchJob(jobId, { status: "cancelled" });
        } else if (finalRunner.state === "paused") {
          touchJob(jobId, { status: "paused" });
        } else {
          const remaining = db
            .select()
            .from(products)
            .where(eq(products.jobId, jobId))
            .all()
            .filter((p) => ["pending", "queued", "searching"].includes(p.status));
          touchJob(jobId, { status: remaining.length > 0 ? "paused" : "completed" });
          finalRunner.state = "idle";
        }
      }
    })();
    return;
  }

  // Default "Start Search" path: the phase-aware, quota-governed run across
  // the whole job.
  touchJob(jobId, { status: "running", pauseReason: null, totalProducts: job.totalProducts });

  void (async () => {
    const domainFilterMode = (job.domainFilterMode ?? "none") as DomainFilterMode;
    const result = await runPhaseAwareJob(
      jobId,
      job.concurrency || env.SEARCH_CONCURRENCY,
      domainFilterMode,
      job.officialDomain ?? null,
      runner
    );
    const finalRunner = getRunner(jobId);
    if (result === "cancelled") {
      const current = getJob(jobId);
      if (current?.status !== "failed") touchJob(jobId, { status: "cancelled" });
    } else if (result === "quota") {
      touchJob(jobId, { status: "paused", pauseReason: "quota_reached" });
      finalRunner.state = "idle";
    } else {
      touchJob(jobId, { status: "completed" });
      finalRunner.state = "idle";
    }
  })();
}

export function pauseJob(jobId: string) {
  getRunner(jobId).pause();
  touchJob(jobId, { status: "paused", pauseReason: "user" });
}

export function resumeJob(jobId: string) {
  const runner = getRunner(jobId);
  if (runner.state === "paused") {
    touchJob(jobId, { status: "running", pauseReason: null });
    runner.resume();
  } else {
    void startJob(jobId);
  }
}

export function cancelJob(jobId: string) {
  getRunner(jobId).cancel();
  touchJob(jobId, { status: "cancelled" });
}

export function getRunnerState(jobId: string): RunnerState {
  return getRunner(jobId).state;
}
