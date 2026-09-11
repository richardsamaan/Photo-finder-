import type { Sa79Row } from "../types";

/**
 * The Category Study / Risk Flagging reports must anchor every calculation
 * (Gap months, forecasts, coverage) to the SA79 export's own as-of date —
 * the latest Transaction Date it contains — never the real-world system
 * clock. A point-in-time upload from months ago must forecast as of when
 * its data actually ends, not as of whenever someone happens to open the app.
 */
export function latestTransactionDate(rows: Sa79Row[]): Date | null {
  let latest: Date | null = null;
  for (const r of rows) {
    if (!r.transactionDate) continue;
    if (!latest || r.transactionDate > latest) latest = r.transactionDate;
  }
  return latest;
}
