import type { MonthlyPoint, Sa79Row } from "../types";

function monthKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Aggregate a set of sales rows into a chronological map of monthly totals. */
export function aggregateMonthly(rows: Sa79Row[]): Map<string, MonthlyPoint> {
  const map = new Map<string, MonthlyPoint>();
  for (const r of rows) {
    if (!r.transactionDate) continue;
    const y = r.transactionDate.getFullYear();
    const m = r.transactionDate.getMonth() + 1;
    const key = monthKey(y, m);
    let point = map.get(key);
    if (!point) {
      point = { key, year: y, month: m, qty: 0, saleValue: 0, costValue: 0 };
      map.set(key, point);
    }
    point.qty += r.qty;
    point.saleValue += r.saleValue;
    point.costValue += r.costValue;
  }
  return map;
}

/** Sum qty/saleValue/costValue for the 12 calendar months ending the month before `asOf` (trailing 12 full months). */
export function trailing12(series: Map<string, MonthlyPoint>, asOf: Date): { qty: number; saleValue: number; costValue: number } {
  let qty = 0,
    saleValue = 0,
    costValue = 0;
  let y = asOf.getFullYear();
  let m = asOf.getMonth() + 1;
  for (let i = 0; i < 12; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    const p = series.get(monthKey(y, m));
    if (p) {
      qty += p.qty;
      saleValue += p.saleValue;
      costValue += p.costValue;
    }
  }
  return { qty, saleValue, costValue };
}

export { monthKey };
