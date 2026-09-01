import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { jobs, categories } from "../db/schema.js";
import { startJob, pauseJob, resumeJob, cancelJob, getRunnerState } from "../services/queue.js";
import { getDashboardStats, listProducts } from "../services/jobService.js";
import { isSearchConfigured } from "../services/searchProviders/index.js";
import { env } from "../env.js";

export const jobsRouter = Router();

jobsRouter.get("/", (_req, res) => {
  const all = db.select().from(jobs).all().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ jobs: all });
});

jobsRouter.get("/:id", (req, res) => {
  const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
  if (!job) return res.status(404).json({ error: "Job not found." });
  const cats = db.select().from(categories).where(eq(categories.jobId, job.id)).all();
  const stats = getDashboardStats(job.id);
  res.json({
    job,
    categories: cats.map((c) => c.name),
    stats,
    runnerState: getRunnerState(job.id),
    searchConfigured: isSearchConfigured(),
    activeProvider: env.SEARCH_PROVIDER,
  });
});

jobsRouter.post("/:id/start", async (req, res) => {
  const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
  if (!job) return res.status(404).json({ error: "Job not found." });

  if (!isSearchConfigured()) {
    return res.status(412).json({
      error: `Search provider "${env.SEARCH_PROVIDER}" is not configured. Set the required API key(s) in your .env file (see .env.example) before starting a search.`,
      blocked: true,
    });
  }

  const productIds: string[] | undefined = Array.isArray(req.body?.productIds)
    ? req.body.productIds
    : undefined;

  await startJob(job.id, { productIds });
  res.json({ ok: true });
});

jobsRouter.post("/:id/retry-failed", async (req, res) => {
  const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
  if (!job) return res.status(404).json({ error: "Job not found." });
  if (!isSearchConfigured()) {
    return res.status(412).json({ error: "Search provider not configured.", blocked: true });
  }
  await startJob(job.id, { retryFailedOnly: true });
  res.json({ ok: true });
});

jobsRouter.post("/:id/pause", (req, res) => {
  pauseJob(req.params.id);
  res.json({ ok: true });
});

jobsRouter.post("/:id/resume", (req, res) => {
  resumeJob(req.params.id);
  res.json({ ok: true });
});

jobsRouter.post("/:id/cancel", (req, res) => {
  cancelJob(req.params.id);
  res.json({ ok: true });
});

jobsRouter.get("/:id/products", (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status.split(",") : undefined;
  const rows = listProducts(req.params.id, status);
  res.json({ products: rows });
});
