import type { Inv01Row, OrderRow, Sa79Row, SubCategoryConflict, SubCategoryDecision } from "../types";

// Mirrors categoryResolution.ts exactly, one level below Category: Sub Category
// is resolved the same way (INV01/SA79 sources, conflict-flagged, never
// auto-resolved) and Order-on-the-way's own "Sub Category" column is only ever
// a suggestion for brand-new SKUs — same role as suggestedCategory.

export interface SubCategorySource {
  itemCode: string;
  subCategory: string;
  source: string; // e.g. "INV01" | "SA79"
}

/** Collect every (itemCode -> subCategory) observation from the files loaded this session. */
export function collectSubCategorySources(inv01: Inv01Row[], sa79: Sa79Row[]): SubCategorySource[] {
  const out: SubCategorySource[] = [];
  for (const r of inv01) {
    if (r.itemCode && r.subCategory) out.push({ itemCode: r.itemCode, subCategory: r.subCategory, source: "INV01" });
  }
  for (const r of sa79) {
    if (r.itemCode && r.subCategory) out.push({ itemCode: r.itemCode, subCategory: r.subCategory, source: "SA79" });
  }
  return out;
}

export interface SubCategoryResolutionResult {
  /** Final SKU -> sub category table (only entries safe to use in reports). */
  table: Map<string, string>;
  /** SKUs where INV01 and SA79 disagree on sub category — must be resolved manually before reports run. */
  conflicts: SubCategoryConflict[];
  /** New-to-this-session SKUs from Order on the way, needing a confirm/override before use. */
  newFromOrders: { itemCode: string; suggestedSubCategory: string }[];
  /** SKUs already covered by a loaded "previous category decisions" file. */
  fromPreviousDecisions: string[];
}

/**
 * Build the SKU -> Sub Category table. Does NOT auto-resolve conflicts — those
 * are surfaced for a human to pick, and are excluded from `table` until resolved
 * (via `manualOverrides`). `manualOverrides` also carries confirmed values for
 * new Order-on-the-way SKUs and previously-downloaded decisions.
 */
export function resolveSubCategories(
  sources: SubCategorySource[],
  orderRows: OrderRow[],
  manualOverrides: Map<string, string>,
  previousDecisions: Map<string, string>
): SubCategoryResolutionResult {
  const bySku = new Map<string, Map<string, Set<string>>>(); // itemCode -> subCategory -> sources
  for (const s of sources) {
    if (!bySku.has(s.itemCode)) bySku.set(s.itemCode, new Map());
    const subCatMap = bySku.get(s.itemCode)!;
    if (!subCatMap.has(s.subCategory)) subCatMap.set(s.subCategory, new Set());
    subCatMap.get(s.subCategory)!.add(s.source);
  }

  const table = new Map<string, string>();
  const conflicts: SubCategoryConflict[] = [];

  // previous decisions are pre-filled first (lowest precedence — a fresh
  // conflict or manual override this session still wins if present).
  for (const [sku, subCat] of previousDecisions) table.set(sku, subCat);

  for (const [sku, subCatMap] of bySku) {
    if (manualOverrides.has(sku)) {
      table.set(sku, manualOverrides.get(sku)!);
      continue;
    }
    if (subCatMap.size === 1) {
      table.set(sku, [...subCatMap.keys()][0]);
    } else {
      conflicts.push({
        itemCode: sku,
        candidates: [...subCatMap.entries()].map(([subCategory, srcs]) => ({
          source: [...srcs].join(", "),
          subCategory,
        })),
      });
    }
  }

  // Order-on-the-way SKUs not yet covered by any resolved sub category.
  const newFromOrders: { itemCode: string; suggestedSubCategory: string }[] = [];
  const seenOrderSkus = new Set<string>();
  for (const o of orderRows) {
    if (!o.line || seenOrderSkus.has(o.line)) continue;
    seenOrderSkus.add(o.line);
    if (table.has(o.line)) continue;
    if (manualOverrides.has(o.line)) {
      table.set(o.line, manualOverrides.get(o.line)!);
      continue;
    }
    newFromOrders.push({ itemCode: o.line, suggestedSubCategory: o.suggestedSubCategory });
  }

  return {
    table,
    conflicts,
    newFromOrders,
    fromPreviousDecisions: [...previousDecisions.keys()],
  };
}

/** Manually-assigned decisions worth persisting for next session (conflicts resolved + new-item confirmations). */
export function manualSubCategoryDecisionsForExport(manualOverrides: Map<string, string>): SubCategoryDecision[] {
  return [...manualOverrides.entries()].map(([itemCode, subCategory]) => ({ itemCode, subCategory, manual: true }));
}
