import type { ForecastMethod, Inv01Row, OrderRow, Sa79Row, ViewScope } from "../types";
import { FORECAST_METHODS } from "../types";
import { aggregateMonthly } from "./monthlyAggregate";
import { computeAllForecasts, computeForecast, type ForecastResult } from "./forecast";
import { sa79ForScope, stockForScope } from "./scoping";
import { parseStyleColourSize } from "./referenceParse";

export function categoryOf(itemCode: string, table: Map<string, string>): string {
  return table.get(itemCode) ?? "(Uncategorized)";
}

export function subCategoryOf(itemCode: string, table: Map<string, string>): string {
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

function nextShipmentDateForGroup(group: string, orders: OrderRow[], groupOfOrder: (o: OrderRow) => string, reportDate: Date): Date | null {
  let best: Date | null = null;
  for (const o of orders) {
    if (!o.expectedDeliveryDate) continue;
    if (o.expectedDeliveryDate < reportDate) continue;
    if (groupOfOrder(o) !== group) continue;
    if (!best || o.expectedDeliveryDate < best) best = o.expectedDeliveryDate;
  }
  return best;
}

/**
 * Shared engine behind Category Study (grouped by Category) and its Sub
 * Category drill-down (grouped by Sub Category, pre-restricted to one parent
 * Category) — every forecast/coverage figure is computed fresh for the group,
 * never inherited from the parent.
 */
function buildGroupedStudy(
  inv01: Inv01Row[],
  sa79: Sa79Row[],
  orders: OrderRow[],
  scope: ViewScope,
  reportDate: Date,
  groupOfInv01: (r: Inv01Row) => string,
  groupOfSa79: (r: Sa79Row) => string,
  groupOfOrder: (o: OrderRow) => string
): CategoryStudyRow[] {
  const scopedSa79 = sa79ForScope(sa79, scope);
  const groups = new Set<string>();
  for (const r of inv01) groups.add(groupOfInv01(r));
  for (const r of scopedSa79) groups.add(groupOfSa79(r));

  const out: CategoryStudyRow[] = [];
  for (const group of groups) {
    let soh = 0;
    let sohCost = 0;
    for (const r of inv01) {
      if (groupOfInv01(r) !== group) continue;
      const s = stockForScope(r, scope);
      soh += s.curStk;
      sohCost += s.curStkCost;
    }
    const groupSales = scopedSa79.filter((r) => groupOfSa79(r) === group);
    const series = aggregateMonthly(groupSales);
    const nextShipmentDate = nextShipmentDateForGroup(group, orders, groupOfOrder, reportDate);
    const forecasts = computeAllForecasts(series, reportDate, nextShipmentDate);
    const coverageMonths: Record<ForecastMethod, number | null> = {} as Record<ForecastMethod, number | null>;
    for (const m of FORECAST_METHODS) {
      coverageMonths[m.id] = computeCoverageMonths(soh, forecasts[m.id]);
    }
    out.push({ category: group, soh, sohCost, nextShipmentDate, forecasts, coverageMonths });
  }
  return out.sort((a, b) => a.category.localeCompare(b.category));
}

export function buildCategoryStudy(
  inv01: Inv01Row[],
  sa79: Sa79Row[],
  orders: OrderRow[],
  categoryTable: Map<string, string>,
  scope: ViewScope,
  reportDate: Date
): CategoryStudyRow[] {
  const groupOfInv01 = (r: Inv01Row) => categoryOf(r.itemCode, categoryTable);
  const groupOfSa79 = (r: Sa79Row) => categoryOf(r.itemCode, categoryTable);
  const groupOfOrder = (o: OrderRow) => categoryOf(o.line, categoryTable);
  return buildGroupedStudy(inv01, sa79, orders, scope, reportDate, groupOfInv01, groupOfSa79, groupOfOrder);
}

/** Sub Category drill-down for Category Study — restricted to one parent Category, grouped by Sub Category. */
export function buildSubCategoryStudy(
  inv01: Inv01Row[],
  sa79: Sa79Row[],
  orders: OrderRow[],
  categoryTable: Map<string, string>,
  subCategoryTable: Map<string, string>,
  scope: ViewScope,
  reportDate: Date,
  category: string
): CategoryStudyRow[] {
  const inCategoryInv01 = (r: Inv01Row) => categoryOf(r.itemCode, categoryTable) === category;
  const inCategorySa79 = (r: Sa79Row) => categoryOf(r.itemCode, categoryTable) === category;
  const inCategoryOrder = (o: OrderRow) => categoryOf(o.line, categoryTable) === category;

  const groupOfInv01 = (r: Inv01Row) => subCategoryOf(r.itemCode, subCategoryTable);
  const groupOfSa79 = (r: Sa79Row) => subCategoryOf(r.itemCode, subCategoryTable);
  const groupOfOrder = (o: OrderRow) => subCategoryOf(o.line, subCategoryTable);

  return buildGroupedStudy(
    inv01.filter(inCategoryInv01),
    sa79.filter(inCategorySa79),
    orders.filter(inCategoryOrder),
    scope,
    reportDate,
    groupOfInv01,
    groupOfSa79,
    groupOfOrder
  );
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

function studyToRiskRows(study: CategoryStudyRow[], method: ForecastMethod): RiskRow[] {
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

export function buildRiskFlagging(
  inv01: Inv01Row[],
  sa79: Sa79Row[],
  orders: OrderRow[],
  categoryTable: Map<string, string>,
  scope: ViewScope,
  reportDate: Date,
  method: ForecastMethod
): RiskRow[] {
  return studyToRiskRows(buildCategoryStudy(inv01, sa79, orders, categoryTable, scope, reportDate), method);
}

/** Sub Category drill-down for Risk Flagging — restricted to one parent Category, tiered per Sub Category. */
export function buildSubCategoryRiskFlagging(
  inv01: Inv01Row[],
  sa79: Sa79Row[],
  orders: OrderRow[],
  categoryTable: Map<string, string>,
  subCategoryTable: Map<string, string>,
  scope: ViewScope,
  reportDate: Date,
  method: ForecastMethod,
  category: string
): RiskRow[] {
  return studyToRiskRows(
    buildSubCategoryStudy(inv01, sa79, orders, categoryTable, subCategoryTable, scope, reportDate, category),
    method
  );
}

function skuRiskRow(sku: Inv01Row, scopedSa79: Sa79Row[], orders: OrderRow[], scope: ViewScope, reportDate: Date, method: ForecastMethod): RiskSkuRow {
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
  const skus = inv01.filter((r) => categoryOf(r.itemCode, categoryTable) === category);
  return skus.map((sku) => skuRiskRow(sku, scopedSa79, orders, scope, reportDate, method));
}

/** SKU-level drilldown one level further down — restricted to one parent Category AND Sub Category. */
export function buildRiskSkuDrilldownForSubCategory(
  inv01: Inv01Row[],
  sa79: Sa79Row[],
  orders: OrderRow[],
  categoryTable: Map<string, string>,
  subCategoryTable: Map<string, string>,
  scope: ViewScope,
  reportDate: Date,
  method: ForecastMethod,
  category: string,
  subCategory: string
): RiskSkuRow[] {
  const scopedSa79 = sa79ForScope(sa79, scope);
  const skus = inv01.filter(
    (r) =>
      categoryOf(r.itemCode, categoryTable) === category &&
      subCategoryOf(r.itemCode, subCategoryTable) === subCategory
  );
  return skus.map((sku) => skuRiskRow(sku, scopedSa79, orders, scope, reportDate, method));
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

/** Shared engine behind Size/Colour % (grouped by Category) and its Sub Category drill-down. */
function buildGroupedSizeColour(
  inv01: Inv01Row[],
  scopedSa79: Sa79Row[],
  colourKeyMap: Map<string, string>,
  scope: ViewScope,
  groupOfInv01: (r: Inv01Row) => string,
  groupOfSa79: (r: Sa79Row) => string
): SizeColourRow[] {
  const out: SizeColourRow[] = [];

  const groups = new Set<string>();
  for (const r of inv01) groups.add(groupOfInv01(r));
  for (const r of scopedSa79) groups.add(groupOfSa79(r));

  for (const group of groups) {
    // Sales side (from SA79 — already has size + colour resolved).
    const groupSales = scopedSa79.filter((r) => groupOfSa79(r) === group);
    const totalSalesQty = groupSales.reduce((sum, r) => sum + r.qty, 0);
    const salesBySizeColour = new Map<string, number>();
    for (const r of groupSales) {
      const size = r.itemSize || "(Unknown)";
      const colour = r.colourName || r.colourCode || "(Unknown)";
      const key = `${size}||${colour}`;
      salesBySizeColour.set(key, (salesBySizeColour.get(key) ?? 0) + r.qty);
    }

    // Stock side (from INV01 — size/colour extracted from Reference the same way as SA79).
    const groupStock = inv01.filter((r) => groupOfInv01(r) === group);
    const stockBySizeColour = new Map<string, number>();
    let totalStockQty = 0;
    for (const r of groupStock) {
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
      out.push({ category: group, size, colour, salesMixPct, sohMixPct, diffPct, suggestion });
    }
  }

  return out.sort((a, b) => a.category.localeCompare(b.category) || a.size.localeCompare(b.size) || a.colour.localeCompare(b.colour));
}

export function buildSizeColourSuggestion(
  inv01: Inv01Row[],
  sa79: Sa79Row[],
  categoryTable: Map<string, string>,
  colourKeyMap: Map<string, string>,
  scope: ViewScope
): SizeColourRow[] {
  const scopedSa79 = sa79ForScope(sa79, scope);
  return buildGroupedSizeColour(
    inv01,
    scopedSa79,
    colourKeyMap,
    scope,
    (r) => categoryOf(r.itemCode, categoryTable),
    (r) => categoryOf(r.itemCode, categoryTable)
  );
}

/** Sub Category drill-down for Size/Colour % — restricted to one parent Category, grouped by Sub Category. */
export function buildSubCategorySizeColourSuggestion(
  inv01: Inv01Row[],
  sa79: Sa79Row[],
  categoryTable: Map<string, string>,
  subCategoryTable: Map<string, string>,
  colourKeyMap: Map<string, string>,
  scope: ViewScope,
  category: string
): SizeColourRow[] {
  const scopedSa79 = sa79ForScope(sa79, scope);
  const inCategoryInv01 = inv01.filter((r) => categoryOf(r.itemCode, categoryTable) === category);
  const inCategorySa79 = scopedSa79.filter((r) => categoryOf(r.itemCode, categoryTable) === category);
  return buildGroupedSizeColour(
    inCategoryInv01,
    inCategorySa79,
    colourKeyMap,
    scope,
    (r) => subCategoryOf(r.itemCode, subCategoryTable),
    (r) => subCategoryOf(r.itemCode, subCategoryTable)
  );
}

// Report 4 (Profitability) lives in ./profitability.ts — it's a SKU-level
// grouping engine (Category/Location/Season attributes) rather than a fixed
// per-category report like the 3 above, and needs its own location handling
// for the Bazaar toggle.
