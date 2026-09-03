import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { searchQuota } from "../db/schema.js";
import { env } from "../env.js";

const ROW_ID = "singleton";
const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface QuotaStatus {
  cap: number;
  used: number;
  remaining: number;
  windowStart: string;
  resetsAt: string;
}

function currentRow() {
  return db.select().from(searchQuota).where(eq(searchQuota.id, ROW_ID)).get();
}

/** Reads the quota row, rolling the window over if 24h have elapsed since it started. */
function ensureFreshWindow(): { windowStart: string; count: number } {
  const now = Date.now();
  const row = currentRow();

  if (!row) {
    const iso = new Date(now).toISOString();
    db.insert(searchQuota).values({ id: ROW_ID, windowStart: iso, count: 0 }).run();
    return { windowStart: iso, count: 0 };
  }

  const elapsed = now - new Date(row.windowStart).getTime();
  if (elapsed >= WINDOW_MS) {
    const iso = new Date(now).toISOString();
    db.update(searchQuota).set({ windowStart: iso, count: 0 }).where(eq(searchQuota.id, ROW_ID)).run();
    return { windowStart: iso, count: 0 };
  }

  return { windowStart: row.windowStart, count: row.count };
}

export function getQuotaStatus(): QuotaStatus {
  const { windowStart, count } = ensureFreshWindow();
  const cap = env.DAILY_SEARCH_QUOTA;
  return {
    cap,
    used: count,
    remaining: Math.max(0, cap - count),
    windowStart,
    resetsAt: new Date(new Date(windowStart).getTime() + WINDOW_MS).toISOString(),
  };
}

/** True if the current window has budget for `n` more provider queries. */
export function hasQuotaFor(n: number): boolean {
  return getQuotaStatus().remaining >= n;
}

/** Records that `n` real provider queries were just made. */
export function consumeQuota(n: number): void {
  ensureFreshWindow();
  db.update(searchQuota)
    .set({ count: sql`${searchQuota.count} + ${n}` })
    .where(eq(searchQuota.id, ROW_ID))
    .run();
}
