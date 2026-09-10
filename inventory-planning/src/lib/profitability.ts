import { ALL_LOCATIONS, type Inv01Row, type LocationId, type LocationMeta, type Sa79Row } from "../types";
import { categoryOf } from "./reports";

// ---------------------------------------------------------------------------
// Report 4: Profitability — a SKU-level calculation engine, not a fixed
// per-category table. Facts are computed once at SKU level with Category,
// Location, and Season all available as attributes; Phase 1 ships grouping
// by Category or Location only (Season grouping + the investment module
// arrive in Phase 3 on top of this same engine).
// ---------------------------------------------------------------------------

export interface SkuProfitFact {
  itemCode: string;
  category: string;
  location: LocationId;
  season: string;
  qtySold: number;
  /** Sale Value from SA79, treated as Sales ex-VAT — the source files carry no separate VAT field/rate. */
  salesExVat: number;
  costValue: number;
}

export function buildSkuProfitFacts(sa79: Sa79Row[], categoryTable: Map<string, string>): SkuProfitFact[] {
  const facts: SkuProfitFact[] = [];
  for (const r of sa79) {
    if (!r.location) continue; // unmatched Store Name — can't attribute to a location, excluded rather than silently mis-grouped
    facts.push({
      itemCode: r.itemCode,
      category: r.category || categoryOf(r.itemCode, categoryTable),
      location: r.location,
      season: r.season,
      qtySold: r.qty,
      salesExVat: r.saleValue,
      costValue: r.costValue,
    });
  }
  return facts;
}

export interface ProfitGroupRow {
  key: string;
  label: string;
  qtySold: number;
  salesExVat: number;
  costValue: number;
  marginPct: number | null;
  marginValue: number;
  soh: number;
  sellThroughPct: number | null;
}

function aggregate(key: string, label: string, facts: SkuProfitFact[], soh: number): ProfitGroupRow {
  const qtySold = facts.reduce((s, f) => s + f.qtySold, 0);
  const salesExVat = facts.reduce((s, f) => s + f.salesExVat, 0);
  const costValue = facts.reduce((s, f) => s + f.costValue, 0);
  const marginValue = salesExVat - costValue;
  const marginPct = salesExVat > 0 ? (marginValue / salesExVat) * 100 : null;
  const sellThroughPct = qtySold + soh > 0 ? (qtySold / (qtySold + soh)) * 100 : null;
  return { key, label, qtySold, salesExVat, costValue, marginPct, marginValue, soh, sellThroughPct };
}

function sohForCategory(inv01: Inv01Row[], categoryTable: Map<string, string>, category: string, locationIds: LocationId[]): number {
  let total = 0;
  for (const r of inv01) {
    if ((r.category || categoryOf(r.itemCode, categoryTable)) !== category) continue;
    for (const loc of locationIds) total += r.stock[loc]?.curStk ?? 0;
  }
  return total;
}

function sohForLocation(inv01: Inv01Row[], location: LocationId): number {
  let total = 0;
  for (const r of inv01) total += r.stock[location]?.curStk ?? 0;
  return total;
}

/** Group facts (already restricted to `locationIds`) by Category. */
export function groupProfitabilityByCategory(
  facts: SkuProfitFact[],
  inv01: Inv01Row[],
  categoryTable: Map<string, string>,
  locationIds: LocationId[]
): ProfitGroupRow[] {
  const locSet = new Set(locationIds);
  const scoped = facts.filter((f) => locSet.has(f.location));

  const categories = new Set<string>();
  for (const r of inv01) categories.add(r.category || categoryOf(r.itemCode, categoryTable));
  for (const f of scoped) categories.add(f.category);

  return [...categories]
    .map((category) => {
      const catFacts = scoped.filter((f) => f.category === category);
      const soh = sohForCategory(inv01, categoryTable, category, locationIds);
      return aggregate(category, category, catFacts, soh);
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Group facts by Location: one row per location in `locationMetas`, plus a synthetic "Combined" row. */
export function groupProfitabilityByLocation(facts: SkuProfitFact[], inv01: Inv01Row[], locationMetas: LocationMeta[]): ProfitGroupRow[] {
  const rows = locationMetas.map((loc) => {
    const locFacts = facts.filter((f) => f.location === loc.id);
    const soh = sohForLocation(inv01, loc.id);
    return aggregate(loc.id, loc.label, locFacts, soh);
  });

  const locIds = locationMetas.map((l) => l.id);
  const locSet = new Set(locIds);
  const combinedFacts = facts.filter((f) => locSet.has(f.location));
  const combinedSoh = locIds.reduce((s, id) => s + sohForLocation(inv01, id), 0);
  const combined = aggregate("combined", "Combined", combinedFacts, combinedSoh);

  return [combined, ...rows];
}

export const CORE_LOCATIONS: LocationMeta[] = ALL_LOCATIONS.filter((l) => l.id !== "bazaar");
export const BAZAAR_LOCATION: LocationMeta = ALL_LOCATIONS.find((l) => l.id === "bazaar")!;
