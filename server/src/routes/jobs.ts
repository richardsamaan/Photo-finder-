import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { jobs, categories } from "../db/schema.js";
import { startJob, pauseJob, resumeJob, cancelJob, getRunnerState } from "../services/queue.js";
import { getDashboardStats, listProducts, touchJob } from "../services/jobService.js";
import { getSiteHealthSnapshot } from "../services/searchProviders/index.js";

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
    // Process-wide (not per-job) per-site success/failure counters, reset
    // each time the server restarts - see services/searchProviders/health.ts.
    siteHealth: getSiteHealthSnapshot(),
  });
});

const jobSettingsSchema = z.object({
  domainFilterMode: z.enum(["none", "official_only", "official_plus_allowlist"]).optional(),
  officialDomain: z.string().trim().max(253).optional().nullable(),
});

jobsRouter.patch("/:id/settings", (req, res) => {
  const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
  if (!job) return res.status(404).json({ error: "Job not found." });

  const parsed = jobSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid job settings." });

  const nextMode = parsed.data.domainFilterMode ?? job.domainFilterMode;
  const nextDomain = parsed.data.officialDomain !== undefined ? parsed.data.officialDomain : job.officialDomain;
  if (nextMode !== "none" && !nextDomain?.trim()) {
    return res.status(400).json({ error: "An official domain is required for this filter mode." });
  }

  touchJob(job.id, {
    domainFilterMode: nextMode,
    officialDomain: nextDomain?.trim() || null,
  });
  const updated = db.select().from(jobs).where(eq(jobs.id, job.id)).get();
  res.json({ job: updated });
});

jobsRouter.post("/:id/start", async (req, res) => {
  const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
  if (!job) return res.status(404).json({ error: "Job not found." });

  const productIds: string[] | undefined = Array.isArray(req.body?.productIds)
    ? req.body.productIds
    : undefined;

  await startJob(job.id, { productIds });
  res.json({ ok: true });
});

jobsRouter.post("/:id/retry-failed", async (req, res) => {
  const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
  if (!job) return res.status(404).json({ error: "Job not found." });
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
