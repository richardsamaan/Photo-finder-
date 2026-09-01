import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { products } from "../db/schema.js";
import { searchAndVerifyProduct } from "./productSearch.js";
import { touchJob, incrementProcessed, getJob } from "./jobService.js";
import { ProviderNotConfiguredError } from "./searchProviders/types.js";
import { env } from "../env.js";

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
    targetProducts = options.productIds.map((id) =>
      db.select().from(products).where(eq(products.id, id)).get()
    ).filter(Boolean) as (typeof products.$inferSelect)[];
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

  touchJob(jobId, { status: "running", totalProducts: job.totalProducts || productIds.length });

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
}

export function pauseJob(jobId: string) {
  getRunner(jobId).pause();
  touchJob(jobId, { status: "paused" });
}

export function resumeJob(jobId: string) {
  const runner = getRunner(jobId);
  if (runner.state === "paused") {
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
