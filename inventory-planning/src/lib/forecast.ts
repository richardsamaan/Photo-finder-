import type { ForecastMethod, MonthlyPoint } from "../types";
import { monthKey, trailing12 } from "./monthlyAggregate";

export interface GapMonth {
  year: number;
  month: number; // 1-12
}

function daysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return (utcB - utcA) / 86400000;
}

/**
 * Gap months = the real calendar distance between the report date and the
 * next shipment date, in days, rounded to the nearest whole month (÷30.44).
 * e.g. report date Aug 31 -> shipment Oct 31 = 61 days -> round(61/30.44) = 2.
 * If the shipment is due on/before the report date, the gap is 0.
 */
export function gapMonthsCount(reportDate: Date, shipmentDate: Date | null): number {
  if (!shipmentDate) return 0;
  const days = daysBetween(reportDate, shipmentDate);
  if (days <= 0) return 0;
  return Math.max(0, Math.round(days / 30.44));
}

/**
 * Which specific calendar months YoY sums actuals from. The gap is now a
 * day-based count rather than an explicit list of calendar months, so YoY
 * (which needs actual named months to look up "this month last year") counts
 * back `count` months from — and including — the shipment's own month.
 * The shipment's own month is included deliberately: a shipment dated deep
 * into its month (e.g. Oct 31) doesn't cover any of that month's demand,
 * so stock on hand has to last through it too.
 */
export function yoyMonthList(shipmentDate: Date, count: number): GapMonth[] {
  const result: GapMonth[] = [];
  let y = shipmentDate.getFullYear();
  let m = shipmentDate.getMonth() + 1;
  for (let i = 0; i < count; i++) {
    result.unshift({ year: y, month: m });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return result;
}

export interface ForecastResult {
  method: ForecastMethod;
  forecastQty: number;
  gapMonthsCount: number;
  /** True when the underlying history was too thin for this method to be fully reliable. */
  lowConfidence: boolean;
  note?: string;
}

function avg12Forecast(series: Map<string, MonthlyPoint>, reportDate: Date, gapCount: number): ForecastResult {
  const annual = trailing12(series, reportDate).qty;
  const forecastQty = (annual / 12) * gapCount;
  return { method: "avg12", forecastQty, gapMonthsCount: gapCount, lowConfidence: annual === 0 };
}

function yoyForecast(series: Map<string, MonthlyPoint>, monthList: GapMonth[]): ForecastResult {
  let qty = 0;
  let missing = 0;
  for (const g of monthList) {
    const p = series.get(monthKey(g.year - 1, g.month));
    if (p) qty += p.qty;
    else missing += 1;
  }
  return {
    method: "yoy",
    forecastQty: qty,
    gapMonthsCount: monthList.length,
    lowConfidence: monthList.length > 0 && missing === monthList.length,
    note:
      missing > 0 && monthList.length > 0
        ? `No same-month-last-year data for ${missing} of ${monthList.length} gap month(s).`
        : undefined,
  };
}

function trailing3Forecast(series: Map<string, MonthlyPoint>, reportDate: Date, gapCount: number): ForecastResult {
  let y = reportDate.getFullYear();
  let m = reportDate.getMonth() + 1;
  let qty = 0;
  let monthsFound = 0;
  for (let i = 0; i < 3; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    const p = series.get(monthKey(y, m));
    if (p) {
      qty += p.qty;
      monthsFound += 1;
    }
  }
  const avg = monthsFound > 0 ? qty / monthsFound : 0;
  return {
    method: "trailing3",
    forecastQty: avg * gapCount,
    gapMonthsCount: gapCount,
    lowConfidence: monthsFound < 3,
    note: monthsFound < 3 ? `Only ${monthsFound} of the last 3 months have sales history.` : undefined,
  };
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatGapMonth(g: GapMonth): string {
  return `${MONTH_ABBR[g.month - 1]}${String(g.year).slice(-2)}`;
}

/**
 * The calendar months YoY actually pulls sales from — computed fresh from
 * each category/SKU's own gap rather than a static label, since two rows
 * with different next-shipment dates use different YoY months.
 */
export function yoyPeriodLabel(monthList: GapMonth[]): string | null {
  if (monthList.length === 0) return null;
  const shifted = monthList.map((g) => ({ year: g.year - 1, month: g.month }));
  const first = formatGapMonth(shifted[0]);
  const last = formatGapMonth(shifted[shifted.length - 1]);
  return first === last ? first : `${first}–${last}`;
}

export function computeForecast(
  method: ForecastMethod,
  series: Map<string, MonthlyPoint>,
  reportDate: Date,
  shipmentDate: Date | null
): ForecastResult {
  const gapCount = gapMonthsCount(reportDate, shipmentDate);
  switch (method) {
    case "avg12":
      return avg12Forecast(series, reportDate, gapCount);
    case "yoy":
      return yoyForecast(series, shipmentDate ? yoyMonthList(shipmentDate, gapCount) : []);
    case "trailing3":
      return trailing3Forecast(series, reportDate, gapCount);
  }
}

export function computeAllForecasts(
  series: Map<string, MonthlyPoint>,
  reportDate: Date,
  shipmentDate: Date | null
): Record<ForecastMethod, ForecastResult> {
  return {
    avg12: computeForecast("avg12", series, reportDate, shipmentDate),
    yoy: computeForecast("yoy", series, reportDate, shipmentDate),
    trailing3: computeForecast("trailing3", series, reportDate, shipmentDate),
  };
}
