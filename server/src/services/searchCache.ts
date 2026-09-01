import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { searchCache } from "../db/schema.js";
import { newId } from "../lib/ids.js";
import type { CandidateScore } from "./verification.js";

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function cacheKeyFor(styleCode: string, colour: string): string {
  return `${normalize(styleCode)}|${normalize(colour)}`;
}

export interface CachedEntry {
  status: string;
  confidence: number;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  candidates: CandidateScore[];
}

export function getCachedResult(styleCode: string, colour: string): CachedEntry | null {
  const key = cacheKeyFor(styleCode, colour);
  const row = db.select().from(searchCache).where(eq(searchCache.cacheKey, key)).get();
  if (!row) return null;
  return {
    status: row.status,
    confidence: row.confidence,
    imageUrl: row.imageUrl,
    sourceUrl: row.sourceUrl,
    sourceName: row.sourceName,
    candidates: row.resultsJson ? JSON.parse(row.resultsJson) : [],
  };
}

export function upsertCacheResult(
  styleCode: string,
  colour: string,
  entry: {
    status: string;
    confidence: number;
    imageUrl?: string | null;
    sourceUrl?: string | null;
    sourceName?: string | null;
    candidates: CandidateScore[];
  }
) {
  const key = cacheKeyFor(styleCode, colour);
  const existing = db.select().from(searchCache).where(eq(searchCache.cacheKey, key)).get();
  const now = new Date().toISOString();

  if (existing) {
    db.update(searchCache)
      .set({
        status: entry.status,
        confidence: entry.confidence,
        imageUrl: entry.imageUrl ?? null,
        sourceUrl: entry.sourceUrl ?? null,
        sourceName: entry.sourceName ?? null,
        resultsJson: JSON.stringify(entry.candidates),
        updatedAt: now,
      })
      .where(eq(searchCache.cacheKey, key))
      .run();
  } else {
    db.insert(searchCache)
      .values({
        id: newId("cache"),
        cacheKey: key,
        styleCode,
        colour,
        status: entry.status,
        confidence: entry.confidence,
        imageUrl: entry.imageUrl ?? null,
        sourceUrl: entry.sourceUrl ?? null,
        sourceName: entry.sourceName ?? null,
        resultsJson: JSON.stringify(entry.candidates),
      })
      .run();
  }
}

export function clearCache() {
  db.delete(searchCache).run();
}
