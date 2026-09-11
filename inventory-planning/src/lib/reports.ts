import type { ForecastMethod, Inv01Row, OrderRow, Sa79Row, ViewScope } from "../types";
import { FORECAST_METHODS } from "../types";
import { aggregateMonthly } from "./monthlyAggregate";
import { computeAllForecasts, computeForecast, type ForecastResult } from "./forecast";
import { sa79ForScope, stockForScope } from "./scoping";
import { parseStyleColourSize } from "./referenceParse";

export function categoryOf(itemCode: string, table: Map<string, string>): string {
  return table.get(itemCode) ?? "(Uncategorized)";
}

// ---------------------------------------------------------------------------
// Report 1: Category Study
// ---------------------------------------------------------------------------

export interface CategoryStudyRow {
  category: string;
  soh: number;
  sohCost: number;
  nextShipmentDate: Date | null;
  forecasts: Record<ForecastMethod, ForecastResult>;
  /**
   * How many months current stock covers at the forecasted monthly demand
   * rate (forecast ÷ gap months), per method — SOH ÷ that rate. Null when
   * there's no gap to cover, or no demand was forecasted for it.
   */
  coverageMonths: Record<ForecastMethod, number | null>;
}

function computeCoverageMonths(soh: number, forecast: ForecastResult): number | null {
  if (forecast.gapMonthsCount <= 0) return null;
  const monthlyRate = forecast.forecastQty / forecast.gapMonthsCount;
  if (monthlyRate <= 0) return null;
  return soh / monthlyRate;
}

function nextShipmentDateForCategory(
  category: string,
  orders: OrderRow[],
  categoryTable: Map<string, string>,
  reportDate: Date
): Date | null {
  let best: Date | null = null;
  for (const o of orders) {
    if (!o.expectedDeliveryDate) continue;
    if (o.expectedDeliveryDate < reportDate) continue;
    const cat = categoryTable.get(o.line) ?? o.suggestedCategory ?? "(Uncategorized)";
    if (cat !== category) continue;
    if (!best || o.expectedDeliveryDate < best) best = o.expectedDeliveryDate;
  }
  return best;
}

export function buildCategoryStudy(
  inv01: Inv01Row[],
  sa79: Sa79Row[],
  orders: OrderRow[],
  categoryTable: Map<string, string>,
  scope: ViewScope,
  reportDate: Date
): CategoryStudyRow[] {
  const scopedSa79 = sa79ForScope(sa79, scope);
  const categories = new Set<string>();
  for (const r of inv01) categories.add(categoryOf(r.itemCode, categoryTable) || r.category || "(Uncategorized)");
  for (const r of scopedSa79) categories.add(r.category || categoryOf(r.itemCode, categoryTable));

  const out: CategoryStudyRow[] = [];
  for (const category of categories) {
    let soh = 0;
    let sohCost = 0;
    for (const r of inv01) {
      const cat = r.category || categoryOf(r.itemCode, categoryTable);
      if (cat !== category) continue;
      const s = stockForScope(r, scope);
      soh += s.curStk;
      sohCost += s.curStkCost;
    }
    const catSales = scopedSa79.filter((r) => (r.category || categoryOf(r.itemCode, categoryTable)) === category);
    const series = aggregateMonthly(catSales);
    const nextShipmentDate = nextShipmentDateForCategory(category, orders, categoryTable, reportDate);
    const forecasts = computeAllForecasts(series, reportDate, nextShipmentDate);
    const coverageMonths: Record<ForecastMethod, number | null> = {} as Record<ForecastMethod, number | null>;
    for (const m of FORECAST_METHODS) {
      coverageMonths[m.id] = computeCoverageMonths(soh, forecasts[m.id]);
    }
    out.push({ category, soh, sohCost, nextShipmentDate, forecasts, coverageMonths });
  }
  return out.sort((a, b) => a.category.localeCompare(b.category));
}

// ---------------------------------------------------------------------------
// Report 2: Risk Flagging
// ---------------------------------------------------------------------------

export type RiskTier = "red" | "green" | "blue";

export interface RiskRow {
  category: string;
  soh: number;
  predictedSales: number;
  coveragePct: number | null; // soh / predicted * 100
  tier: RiskTier;
  nextShipmentDate: Date | null;
}

export interface RiskSkuRow {
  itemCode: string;
  itemDesc: string;
  soh: number;
  predictedSales: number;
  coveragePct: number | null;
  tier: RiskTier;
}

export function tierFor(soh: number, predicted: number): RiskTier {
  if (predicted <= 0) return soh > 0 ? "blue" : "green";
  const pct = (soh / predicted) * 100;
  if (pct < 95) return "red";
  if (pct > 105) return "blue";
  return "green";
}

export function buildRiskFlagging(
  inv01: Inv01Row[],
  sa79: Sa79Row[],
  orders: OrderRow[],
  categoryTable: Map<string, string>,
  scope: ViewScope,
  reportDate: Date,
  method: ForecastMethod
): RiskRow[] {
  const study = buildCategoryStudy(inv01, sa79, orders, categoryTable, scope, reportDate);
  return study.map((row) => {
    const predictedSales = row.forecasts[method].forecastQty;
    return {
      category: row.category,
      soh: row.soh,
      predictedSales,
      coveragePct: predictedSales > 0 ? (row.soh / predictedSales) * 100 : null,
      tier: tierFor(row.soh, predictedSales),
      nextShipmentDate: row.nextShipmentDate,
    };
  });
}

export function buildRiskSkuDrilldown(
  inv01: Inv01Row[],
  sa79: Sa79Row[],
  orders: OrderRow[],
  categoryTable: Map<string, string>,
  scope: ViewScope,
  reportDate: Date,
  method: ForecastMethod,
  category: string
): RiskSkuRow[] {
  const scopedSa79 = sa79ForScope(sa79, scope);
  const skus = inv01.filter((r) => (r.category || categoryOf(r.itemCode, categoryTable)) === category);
  return skus.map((sku) => {
    const s = stockForScope(sku, scope);
    const skuSales = scopedSa79.filter((r) => r.itemCode === sku.itemCode);
    const series = aggregateMonthly(skuSales);
    let nextShipmentDate: Date | null = null;
    for (const o of orders) {
      if (o.line !== sku.itemCode || !o.expectedDeliveryDate || o.expectedDeliveryDate < reportDate) continue;
      if (!nextShipmentDate || o.expectedDeliveryDate < nextShipmentDate) nextShipmentDate = o.expectedDeliveryDate;
    }
    const forecast = computeForecast(method, series, reportDate, nextShipmentDate);
    const predictedSales = forecast.forecastQty;
    return {
      itemCode: sku.itemCode,
      itemDesc: sku.itemDesc,
      soh: s.curStk,
      predictedSales,
      coveragePct: predictedSales > 0 ? (s.curStk / predictedSales) * 100 : null,
      tier: tierFor(s.curStk, predictedSales),
    };
  });
}

// ---------------------------------------------------------------------------
// Report 3: Size / Colour Suggestion %
// ---------------------------------------------------------------------------

export interface SizeColourRow {
  category: string;
  size: string;
  colour: string;
  salesMixPct: number;
  sohMixPct: number;
  diffPct: number; // sohMixPct - salesMixPct
  suggestion: "Increase (under-supplied)" | "Decrease (over-supplied)" | "Balanced";
}

const SIZE_COLOUR_BALANCE_THRESHOLD_PP = 3;

export function buildSizeColourSuggestion(
  inv01: Inv01Row[],
  sa79: Sa79Row[],
  categoryTable: Map<string, string>,
  colourKeyMap: Map<string, string>,
  scope: ViewScope
): SizeColourRow[] {
  const scopedSa79 = sa79ForScope(sa79, scope);
  const out: SizeColourRow[] = [];

  const categories = new Set<string>();
  for (const r of inv01) categories.add(r.category || categoryOf(r.itemCode, categoryTable));
  for (const r of scopedSa79) categories.add(r.category || categoryOf(r.itemCode, categoryTable));

  for (const category of categories) {
    // Sales side (from SA79 — already has size + colour resolved).
    const catSales = scopedSa79.filter((r) => (r.category || categoryOf(r.itemCode, categoryTable)) === category);
    const totalSalesQty = catSales.reduce((sum, r) => sum + r.qty, 0);
    const salesBySizeColour = new Map<string, number>();
    for (const r of catSales) {
      const size = r.itemSize || "(Unknown)";
      const colour = r.colourName || r.colourCode || "(Unknown)";
      const key = `${size}||${colour}`;
      salesBySizeColour.set(key, (salesBySizeColour.get(key) ?? 0) + r.qty);
    }

    // Stock side (from INV01 — size/colour extracted from Reference the same way as SA79).
    const catStock = inv01.filter((r) => (r.category || categoryOf(r.itemCode, categoryTable)) === category);
    const stockBySizeColour = new Map<string, number>();
    let totalStockQty = 0;
    for (const r of catStock) {
      const s = stockForScope(r, scope);
      if (s.curStk === 0) continue;
      const parsed = parseStyleColourSize(r.reference);
      const size = parsed.size || "(Unknown)";
      const colour = (parsed.colourCode && colourKeyMap.get(parsed.colourCode)) || parsed.colourCode || "(Unknown)";
      const key = `${size}||${colour}`;
      stockBySizeColour.set(key, (stockBySizeColour.get(key) ?? 0) + s.curStk);
      totalStockQty += s.curStk;
    }

    const allKeys = new Set([...salesBySizeColour.keys(), ...stockBySizeColour.keys()]);
    for (const key of allKeys) {
      const [size, colour] = key.split("||");
      const salesQty = salesBySizeColour.get(key) ?? 0;
      const stockQty = stockBySizeColour.get(key) ?? 0;
      const salesMixPct = totalSalesQty > 0 ? (salesQty / totalSalesQty) * 100 : 0;
      const sohMixPct = totalStockQty > 0 ? (stockQty / totalStockQty) * 100 : 0;
      const diffPct = sohMixPct - salesMixPct;
      let suggestion: SizeColourRow["suggestion"] = "Balanced";
      if (diffPct < -SIZE_COLOUR_BALANCE_THRESHOLD_PP) suggestion = "Increase (under-supplied)";
      else if (diffPct > SIZE_COLOUR_BALANCE_THRESHOLD_PP) suggestion = "Decrease (over-supplied)";
      out.push({ category, size, colour, salesMixPct, sohMixPct, diffPct, suggestion });
    }
  }

  return out.sort((a, b) => a.category.localeCompare(b.category) || a.size.localeCompare(b.size) || a.colour.localeCompare(b.colour));
}

// Report 4 (Profitability) lives in ./profitability.ts — it's a SKU-level
// grouping engine (Category/Location/Season attributes) rather than a fixed
// per-category report like the 3 above, and needs its own location handling
// for the Bazaar toggle.
