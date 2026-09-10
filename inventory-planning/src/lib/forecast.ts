import type { ForecastMethod, MonthlyPoint } from "../types";
import { monthKey, trailing12 } from "./monthlyAggregate";

export interface GapMonth {
  year: number;
  month: number; // 1-12
}

/**
 * The "gap period" is every calendar month from today's month (inclusive)
 * up to — but excluding — the month the next shipment arrives in, since once
 * that shipment lands it covers its own month.
 * e.g. today = Sep, shipment = Nov -> [Sep, Oct].
 * If the shipment is due this month or already overdue, the gap is empty (0 months).
 */
export function gapMonths(today: Date, shipmentDate: Date | null): GapMonth[] {
  if (!shipmentDate) return [];
  const shipY = shipmentDate.getFullYear();
  const shipM = shipmentDate.getMonth() + 1;
  let y = today.getFullYear();
  let m = today.getMonth() + 1;
  if (y > shipY || (y === shipY && m >= shipM)) return [];

  const result: GapMonth[] = [];
  let guard = 0;
  while (!(y === shipY && m === shipM) && guard < 240) {
    result.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
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

function avg12Forecast(series: Map<string, MonthlyPoint>, today: Date, gap: GapMonth[]): ForecastResult {
  const annual = trailing12(series, today).qty;
  const forecastQty = (annual / 12) * gap.length;
  return { method: "avg12", forecastQty, gapMonthsCount: gap.length, lowConfidence: annual === 0 };
}

function yoyForecast(series: Map<string, MonthlyPoint>, gap: GapMonth[]): ForecastResult {
  let qty = 0;
  let missing = 0;
  for (const g of gap) {
    const p = series.get(monthKey(g.year - 1, g.month));
    if (p) qty += p.qty;
    else missing += 1;
  }
  return {
    method: "yoy",
    forecastQty: qty,
    gapMonthsCount: gap.length,
    lowConfidence: gap.length > 0 && missing === gap.length,
    note: missing > 0 && gap.length > 0 ? `No same-month-last-year data for ${missing} of ${gap.length} gap month(s).` : undefined,
  };
}

function trailing3Forecast(series: Map<string, MonthlyPoint>, today: Date, gap: GapMonth[]): ForecastResult {
  let y = today.getFullYear();
  let m = today.getMonth() + 1;
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
    forecastQty: avg * gap.length,
    gapMonthsCount: gap.length,
    lowConfidence: monthsFound < 3,
    note: monthsFound < 3 ? `Only ${monthsFound} of the last 3 months have sales history.` : undefined,
  };
}

function seasonalityForecast(series: Map<string, MonthlyPoint>, today: Date, gap: GapMonth[]): ForecastResult {
  const monthTotals = new Map<number, number>(); // 1-12 -> total qty across all history
  let grandTotal = 0;
  const yearsPerMonth = new Map<number, number>();
  for (const p of series.values()) {
    monthTotals.set(p.month, (monthTotals.get(p.month) ?? 0) + p.qty);
    yearsPerMonth.set(p.month, (yearsPerMonth.get(p.month) ?? 0) + 1);
    grandTotal += p.qty;
  }
  const annual = trailing12(series, today).qty;
  if (grandTotal === 0) {
    return { method: "seasonality", forecastQty: 0, gapMonthsCount: gap.length, lowConfidence: true, note: "No sales history available." };
  }
  let shareSum = 0;
  for (const g of gap) {
    shareSum += (monthTotals.get(g.month) ?? 0) / grandTotal;
  }
  const yearsOfHistory = Math.max(1, Math.round([...series.keys()].length / 12));
  return {
    method: "seasonality",
    forecastQty: annual * shareSum,
    gapMonthsCount: gap.length,
    lowConfidence: yearsOfHistory < 2,
    note: yearsOfHistory < 2 ? "Less than a full year of history — seasonal shape is a rough estimate." : undefined,
  };
}

export function computeForecast(
  method: ForecastMethod,
  series: Map<string, MonthlyPoint>,
  today: Date,
  shipmentDate: Date | null
): ForecastResult {
  const gap = gapMonths(today, shipmentDate);
  switch (method) {
    case "avg12":
      return avg12Forecast(series, today, gap);
    case "yoy":
      return yoyForecast(series, gap);
    case "trailing3":
      return trailing3Forecast(series, today, gap);
    case "seasonality":
      return seasonalityForecast(series, today, gap);
  }
}

export function computeAllForecasts(
  series: Map<string, MonthlyPoint>,
  today: Date,
  shipmentDate: Date | null
): Record<ForecastMethod, ForecastResult> {
  return {
    avg12: computeForecast("avg12", series, today, shipmentDate),
    yoy: computeForecast("yoy", series, today, shipmentDate),
    trailing3: computeForecast("trailing3", series, today, shipmentDate),
    seasonality: computeForecast("seasonality", series, today, shipmentDate),
  };
}
