import { Router } from "express";
import { db } from "../db/client.js";
import { searchCache } from "../db/schema.js";
import { clearCache } from "../services/searchCache.js";

export const cacheRouter = Router();

cacheRouter.get("/", (_req, res) => {
  const rows = db
    .select()
    .from(searchCache)
    .all()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 500);
  res.json({ entries: rows, total: rows.length });
});

cacheRouter.delete("/", (_req, res) => {
  clearCache();
  res.json({ ok: true });
});
