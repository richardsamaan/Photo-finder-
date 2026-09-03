import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { jobs, products } from "../db/schema.js";
import { generateCategoryPdf, generateMasterPdf, catalogsDir } from "../services/pdfGenerator.js";
import { generateCatalogZip } from "../services/zipGenerator.js";
import { sanitizeCategoryFolder } from "../lib/sanitize.js";

export const exportRouter = Router();

function approvedByCategory(jobId: string) {
  const rows = db
    .select()
    .from(products)
    .where(and(eq(products.jobId, jobId), eq(products.status, "approved")))
    .all();

  const map = new Map<string, typeof rows>();
  for (const p of rows) {
    const list = map.get(p.category) ?? [];
    list.push(p);
    map.set(p.category, list);
  }
  return map;
}

exportRouter.post("/:id/generate-pdfs", async (req, res) => {
  const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
  if (!job) return res.status(404).json({ error: "Job not found." });

  const byCategory = approvedByCategory(job.id);
  if (byCategory.size === 0) {
    return res.status(400).json({ error: "No approved products yet. Approve at least one product first." });
  }

  const categoryPdfs: string[] = [];
  for (const [category, list] of byCategory) {
    await generateCategoryPdf(job.id, category, list);
    categoryPdfs.push(category);
  }
  await generateMasterPdf(job.id, byCategory);

  res.json({ ok: true, categories: categoryPdfs, masterPdf: "Product_Image_Catalog.pdf" });
});

exportRouter.post("/:id/generate-zip", async (req, res) => {
  const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
  if (!job) return res.status(404).json({ error: "Job not found." });

  try {
    await generateCatalogZip(job.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to generate ZIP." });
  }
});

function sendFileFromCatalog(res: any, jobId: string, relativeParts: string[]) {
  const filePath = path.join(catalogsDir(jobId), ...relativeParts);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found. Generate it first." });
  }
  res.download(filePath);
}

exportRouter.get("/:id/download/master-pdf", (req, res) => {
  const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
  if (!job) return res.status(404).json({ error: "Job not found." });
  sendFileFromCatalog(res, job.id, ["Product_Catalog", "Product_Image_Catalog.pdf"]);
});

exportRouter.get("/:id/download/category-pdf/:category", (req, res) => {
  const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
  if (!job) return res.status(404).json({ error: "Job not found." });
  const safe = sanitizeCategoryFolder(req.params.category);
  sendFileFromCatalog(res, job.id, ["Product_Catalog", safe, `${safe}.pdf`]);
});

exportRouter.get("/:id/download/catalog-zip", (req, res) => {
  const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
  if (!job) return res.status(404).json({ error: "Job not found." });
  sendFileFromCatalog(res, job.id, ["Product_Catalog.zip"]);
});

// Export everything still "not found" as an Excel file in the same column
// format as the input, purely for visibility - the job itself tracks resume
// state internally and does not require this file to be re-uploaded.
exportRouter.get("/:id/download/not-found.xlsx", (req, res) => {
  const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
  if (!job) return res.status(404).json({ error: "Job not found." });

  const rows = db
    .select()
    .from(products)
    .where(and(eq(products.jobId, job.id), eq(products.status, "not_found")))
    .all();

  const data = rows.map((r) => ({
    "Style Code": r.styleCode,
    Colour: r.colour,
    Category: r.category,
    Season: r.season ?? "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data, { header: ["Style Code", "Colour", "Category", "Season"] });
  XLSX.utils.book_append_sheet(wb, ws, "Not Found");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="not_found_items.xlsx"');
  res.send(buffer);
});
