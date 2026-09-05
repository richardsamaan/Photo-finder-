import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { products } from "../db/schema.js";
import { searchAndVerifyProduct } from "./productSearch.js";
import { touchJob, incrementProcessed, getJob } from "./jobService.js";
import { env } from "../env.js";
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

interface JobSearchSettings {
  domainFilterMode: DomainFilterMode;
  officialDomain: string | null;
}

/**
 * Processes one product end to end: the escalating Style Code -> +Colour
 * Name -> +Colour Code attempts all happen inside searchAndVerifyProduct
 * itself (see productSearch.ts) - there is no external quota to pace them
 * against anymore, so a single call here can go through all three back-to-back.
 */
async function processOne(jobId: string, productId: string, settings: JobSearchSettings) {
  const product = db.select().from(products).where(eq(products.id, productId)).get();
  if (!product) return;

  db.update(products)
    .set({ status: "searching", attempts: product.attempts + 1, updatedAt: new Date().toISOString() })
    .where(eq(products.id, productId))
    .run();

  try {
    const outcome = await searchAndVerifyProduct(
      {
        id: product.id,
        styleCode: product.styleCode,
        colour: product.colour,
        colourCode: product.colourCode,
        category: product.category,
      },
      { useCache: true, domainFilterMode: settings.domainFilterMode, officialDomain: settings.officialDomain }
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
        searchPhase: outcome.attemptsUsed,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, productId))
      .run();
  } catch (err) {
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

async function runWorkerPool(
  jobId: string,
  productIds: string[],
  concurrency: number,
  settings: JobSearchSettings,
  runner: JobRunner
) {
  let index = 0;
  const next = (): string | null => (index < productIds.length ? productIds[index++] : null);

  const worker = async () => {
    while (true) {
      const runnable = await runner.waitForRunnable();
      if (!runnable) return;
      const id = next();
      if (id === null) return;
      await processOne(jobId, id, settings);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
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

  let targetProducts;
  if (options.productIds && options.productIds.length > 0) {
    targetProducts = options.productIds
      .map((id) => db.select().from(products).where(eq(products.id, id)).get())
      .filter(Boolean) as (typeof products.$inferSelect)[];
  } else if (options.retryFailedOnly) {
    targetProducts = db
      .select()
      .from(products)
      .where(eq(products.jobId, jobId))
      .all()
      .filter((p) => p.status === "failed" || p.status === "not_found");
  } else {
    targetProducts = db
      .select()
      .from(products)
      .where(eq(products.jobId, jobId))
      .all()
      .filter((p) => !["approved", "rejected", "high_confidence", "medium_confidence"].includes(p.status));
  }

  const productIds = targetProducts.map((p) => p.id);
  if (productIds.length === 0) {
    touchJob(jobId, { status: "completed" });
    runner.state = "idle";
    return;
  }

  const settings: JobSearchSettings = {
    domainFilterMode: (job.domainFilterMode ?? "none") as DomainFilterMode,
    officialDomain: job.officialDomain ?? null,
  };

  touchJob(jobId, {
    status: "running",
    pauseReason: null,
    totalProducts: job.totalProducts || productIds.length,
  });

  // Run asynchronously - caller does not await full completion, it polls job
  // status. A full run now processes the whole item list in one pass
  // (bounded only by the per-site politeness delay and normal runtime, not
  // any artificial daily cap) - pause/resume stays available for practical
  // reasons (long runtimes, wanting to check progress), not because of quota.
  void (async () => {
    try {
      await runWorkerPool(jobId, productIds, job.concurrency || env.SEARCH_CONCURRENCY, settings, runner);
    } finally {
      const finalRunner = getRunner(jobId);
      if (finalRunner.state === "cancelled") {
        touchJob(jobId, { status: "cancelled" });
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
