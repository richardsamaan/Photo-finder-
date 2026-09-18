import type { Inv01Row, OrderRow, Sa79Row, SubCategoryConflict, SubCategoryDecision } from "../types";

// Mirrors categoryResolution.ts exactly, one level below Category: Sub
// Category is resolved the same way (INV01/SA79/Order sources, conflict-
// flagged, never auto-resolved). Order on the way is a first-class source
// here too — its own "Sub Category" column feeds the same conflict/consensus
// mechanism as INV01/SA79, not a lower-trust suggestion.

export interface SubCategorySource {
  itemCode: string;
  subCategory: string;
  source: string; // e.g. "INV01" | "SA79" | "Order"
}

/** Collect every (itemCode -> subCategory) observation from the files loaded this session. */
export function collectSubCategorySources(inv01: Inv01Row[], sa79: Sa79Row[], orders: OrderRow[]): SubCategorySource[] {
  const out: SubCategorySource[] = [];
  for (const r of inv01) {
    if (r.itemCode && r.subCategory) out.push({ itemCode: r.itemCode, subCategory: r.subCategory, source: "INV01" });
  }
  for (const r of sa79) {
    if (r.itemCode && r.subCategory) out.push({ itemCode: r.itemCode, subCategory: r.subCategory, source: "SA79" });
  }
  for (const r of orders) {
    if (r.line && r.subCategory) out.push({ itemCode: r.line, subCategory: r.subCategory, source: "Order" });
  }
  return out;
}

export interface SubCategoryResolutionResult {
  /** Final SKU -> sub category table (only entries safe to use in reports). */
  table: Map<string, string>;
  /** SKUs where two or more sources disagree on sub category — must be resolved manually before reports run. */
  conflicts: SubCategoryConflict[];
  /** SKUs already covered by a loaded "previous category decisions" file. */
  fromPreviousDecisions: string[];
}

/**
 * Build the SKU -> Sub Category table. Does NOT auto-resolve conflicts — those
 * are surfaced for a human to pick, and are excluded from `table` until resolved
 * (via `manualOverrides`). `manualOverrides` also carries confirmed values for
 * previously-downloaded decisions.
 */
export function resolveSubCategories(
  sources: SubCategorySource[],
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

  return {
    table,
    conflicts,
    fromPreviousDecisions: [...previousDecisions.keys()],
  };
}

/** Manually-assigned decisions worth persisting for next session (conflicts resolved). */
export function manualSubCategoryDecisionsForExport(manualOverrides: Map<string, string>): SubCategoryDecision[] {
  return [...manualOverrides.entries()].map(([itemCode, subCategory]) => ({ itemCode, subCategory, manual: true }));
}
