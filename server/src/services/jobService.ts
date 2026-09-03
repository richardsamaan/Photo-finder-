import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { jobs, products } from "../db/schema.js";

export function getJob(jobId: string) {
  return db.select().from(jobs).where(eq(jobs.id, jobId)).get();
}

export function touchJob(jobId: string, fields: Partial<typeof jobs.$inferInsert>) {
  db.update(jobs)
    .set({ ...fields, updatedAt: new Date().toISOString() })
    .where(eq(jobs.id, jobId))
    .run();
}

export function incrementProcessed(jobId: string) {
  db.update(jobs)
    .set({
      processedProducts: sql`${jobs.processedProducts} + 1`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, jobId))
    .run();
}

/**
 * Recomputes processedProducts from actual product statuses rather than
 * incrementing a counter - safe to call any number of times, which matters
 * for the phase-aware runner where a single item can be attempted again in
 * a later phase (an incrementing counter would double-count it).
 */
export function recomputeProcessedCount(jobId: string) {
  const rows = db.select().from(products).where(eq(products.jobId, jobId)).all();
  const stillPending = rows.filter((r) => ["pending", "queued", "searching"].includes(r.status)).length;
  touchJob(jobId, { processedProducts: rows.length - stillPending });
}

export function listProducts(jobId: string, statuses?: string[]) {
  if (statuses && statuses.length > 0) {
    return db
      .select()
      .from(products)
      .where(and(eq(products.jobId, jobId), inArray(products.status, statuses as any)))
      .all();
  }
  return db.select().from(products).where(eq(products.jobId, jobId)).all();
}

export function getProduct(productId: string) {
  return db.select().from(products).where(eq(products.id, productId)).get();
}

export function getDashboardStats(jobId: string) {
  const rows = db.select().from(products).where(eq(products.jobId, jobId)).all();
  const stats = {
    totalProducts: rows.length,
    imagesFound: rows.filter((r) => r.imageUrl || r.localImagePath).length,
    highConfidence: rows.filter((r) => r.status === "high_confidence").length,
    mediumConfidence: rows.filter((r) => r.status === "medium_confidence").length,
    needsReview: rows.filter((r) => r.status === "needs_review").length,
    notFound: rows.filter((r) => r.status === "not_found").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    failed: rows.filter((r) => r.status === "failed").length,
    pending: rows.filter((r) => ["pending", "queued", "searching"].includes(r.status)).length,
  };
  return stats;
}
