import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { jobs, categories, products } from "../db/schema.js";
import { newId } from "../lib/ids.js";
import { uploadSpreadsheet } from "../middleware/upload.js";
import { parseSpreadsheet, detectColumns } from "../services/fileParser.js";
import {
  savePendingImport,
  readPendingImport,
  deletePendingImport,
} from "../services/pendingImports.js";

export const importRouter = Router();

importRouter.post("/upload", uploadSpreadsheet.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  let sheet;
  try {
    sheet = parseSpreadsheet(req.file.buffer, req.file.originalname);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Could not parse file." });
  }

  const pending = savePendingImport(req.file.originalname, sheet);
  const mapping = detectColumns(sheet.headers);

  const preview = sheet.rows.slice(0, 20).map((row) => ({
    styleCode: mapping.styleCode ? row[mapping.styleCode] : "",
    colour: mapping.colour ? row[mapping.colour] : "",
    category: mapping.category ? row[mapping.category] : "",
    season: mapping.season ? row[mapping.season] : "",
  }));

  const categoriesGuess = mapping.category
    ? Array.from(new Set(sheet.rows.map((r) => r[mapping.category!]).filter(Boolean)))
    : [];

  res.json({
    token: pending.token,
    filename: pending.originalName,
    headers: sheet.headers,
    totalRows: sheet.rows.length,
    mapping,
    preview,
    detectedCategories: categoriesGuess,
  });
});

const mappingSchema = z.object({
  styleCode: z.string().min(1),
  colour: z.string().min(1),
  category: z.string().min(1),
  season: z.string().optional(), // optional column - "" or omitted means "not mapped"
});

const confirmSchema = mappingSchema.extend({
  domainFilterMode: z.enum(["none", "official_only", "official_plus_allowlist"]).optional(),
  officialDomain: z.string().trim().max(253).optional(),
});

importRouter.post("/:token/preview", (req, res) => {
  const pending = readPendingImport(req.params.token);
  if (!pending) return res.status(404).json({ error: "Import session not found or expired." });

  const parsed = mappingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid column mapping." });
  const mapping = parsed.data;

  for (const col of [mapping.styleCode, mapping.colour, mapping.category, ...(mapping.season ? [mapping.season] : [])]) {
    if (!pending.headers.includes(col)) {
      return res.status(400).json({ error: `Column "${col}" not found in file headers.` });
    }
  }

  const preview = pending.rows.slice(0, 20).map((row) => ({
    styleCode: row[mapping.styleCode],
    colour: row[mapping.colour],
    category: row[mapping.category],
    season: mapping.season ? row[mapping.season] : "",
  }));
  const validRows = pending.rows.filter(
    (r) => r[mapping.styleCode]?.trim() && r[mapping.colour]?.trim() && r[mapping.category]?.trim()
  );
  const invalidCount = pending.rows.length - validRows.length;
  const categoriesGuess = Array.from(new Set(validRows.map((r) => r[mapping.category].trim())));

  res.json({
    preview,
    totalRows: pending.rows.length,
    validRows: validRows.length,
    invalidRows: invalidCount,
    totalCategories: categoriesGuess.length,
    categories: categoriesGuess,
  });
});

importRouter.post("/:token/confirm", (req, res) => {
  const pending = readPendingImport(req.params.token);
  if (!pending) return res.status(404).json({ error: "Import session not found or expired." });

  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid column mapping." });
  const mapping = parsed.data;
  const domainFilterMode = mapping.domainFilterMode ?? "none";
  const officialDomain = mapping.officialDomain?.trim() || null;

  if (domainFilterMode !== "none" && !officialDomain) {
    return res.status(400).json({ error: "An official domain is required for this source-domain filter mode." });
  }

  for (const col of [mapping.styleCode, mapping.colour, mapping.category, ...(mapping.season ? [mapping.season] : [])]) {
    if (!pending.headers.includes(col)) {
      return res.status(400).json({ error: `Column "${col}" not found in file headers.` });
    }
  }

  const validRows = pending.rows.filter(
    (r) => r[mapping.styleCode]?.trim() && r[mapping.colour]?.trim() && r[mapping.category]?.trim()
  );

  if (validRows.length === 0) {
    return res.status(400).json({ error: "No valid rows found after applying the column mapping." });
  }

  const jobId = newId("job");
  const now = new Date().toISOString();

  db.insert(jobs)
    .values({
      id: jobId,
      filename: pending.originalName,
      status: "pending",
      columnMapping: JSON.stringify(mapping),
      totalProducts: validRows.length,
      processedProducts: 0,
      domainFilterMode,
      officialDomain,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const categorySet = new Map<string, string>(); // name -> id
  for (const row of validRows) {
    const catName = row[mapping.category].trim();
    if (!categorySet.has(catName)) {
      const catId = newId("cat");
      categorySet.set(catName, catId);
      db.insert(categories).values({ id: catId, name: catName, jobId }).run();
    }
  }

  db.transaction((tx) => {
    validRows.forEach((row, idx) => {
      tx.insert(products)
        .values({
          id: newId("prod"),
          jobId,
          rowNumber: idx + 1,
          styleCode: row[mapping.styleCode].trim(),
          colour: row[mapping.colour].trim(),
          category: row[mapping.category].trim(),
          season: mapping.season ? row[mapping.season]?.trim() || null : null,
          status: "pending",
        })
        .run();
    });
  });

  deletePendingImport(pending.token);

  res.json({
    jobId,
    totalProducts: validRows.length,
    totalCategories: categorySet.size,
    categories: Array.from(categorySet.keys()),
  });
});

importRouter.post("/:token/cancel", (req, res) => {
  deletePendingImport(req.params.token);
  res.json({ ok: true });
});
