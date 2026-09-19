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
  /** SKUs where two or more sources disagree on sub category (beyond casing) and no decision (bulk or individual) has been made yet this session — must be resolved before reports run. */
  conflicts: SubCategoryConflict[];
  /** Every SKU where two or more sources disagree, whether resolved yet or not — for review UI. A resolved one's current value lives in `manualOverrides`, not here. */
  allConflicts: SubCategoryConflict[];
  /** SKUs already covered by a loaded "previous category decisions" file. */
  fromPreviousDecisions: string[];
}

// Mirrors categoryResolution.ts's case-insensitive matching exactly — "JERSEY"
// (INV01) and "Jersey" (Order) are the same value, not a conflict. When
// sources agree case-insensitively, the canonical (displayed/stored) casing
// is whichever source ranks highest here and actually mentioned this SKU.
const SOURCE_CASING_PRIORITY = ["INV01", "SA79", "Order"];

interface ValueGroup {
  /** Every source that reported some casing of this value. */
  sources: Set<string>;
  /** The exact casing each source used (first one seen, if a source appears more than once). */
  casingBySource: Map<string, string>;
}

function canonicalCasing(group: ValueGroup): string {
  for (const src of SOURCE_CASING_PRIORITY) {
    const casing = group.casingBySource.get(src);
    if (casing) return casing;
  }
  return group.casingBySource.values().next().value!;
}

/**
 * Build the SKU -> Sub Category table. Does NOT auto-resolve genuine
 * conflicts — those are surfaced for a human to pick, and are excluded from
 * `table` until resolved (via `manualOverrides`). A pure casing difference
 * (all sources agree once case is ignored) is never a conflict — it's
 * resolved automatically to the highest-priority source's casing, same as
 * an exact-string agreement always has been. `manualOverrides` also carries
 * confirmed values for previously-downloaded decisions.
 */
export function resolveSubCategories(
  sources: SubCategorySource[],
  manualOverrides: Map<string, string>,
  previousDecisions: Map<string, string>
): SubCategoryResolutionResult {
  const bySku = new Map<string, Map<string, ValueGroup>>(); // itemCode -> lowercased subCategory -> group
  for (const s of sources) {
    if (!bySku.has(s.itemCode)) bySku.set(s.itemCode, new Map());
    const valueMap = bySku.get(s.itemCode)!;
    const key = s.subCategory.toLowerCase();
    if (!valueMap.has(key)) valueMap.set(key, { sources: new Set(), casingBySource: new Map() });
    const group = valueMap.get(key)!;
    group.sources.add(s.source);
    if (!group.casingBySource.has(s.source)) group.casingBySource.set(s.source, s.subCategory);
  }

  const table = new Map<string, string>();
  const conflicts: SubCategoryConflict[] = [];
  const allConflicts: SubCategoryConflict[] = [];

  // previous decisions are pre-filled first (lowest precedence — a fresh
  // conflict or manual override this session still wins if present).
  for (const [sku, subCat] of previousDecisions) table.set(sku, subCat);

  for (const [sku, valueMap] of bySku) {
    if (valueMap.size > 1) {
      const conflict: SubCategoryConflict = {
        itemCode: sku,
        candidates: [...valueMap.values()].map((group) => ({
          source: [...group.sources].join(", "),
          subCategory: canonicalCasing(group),
        })),
      };
      allConflicts.push(conflict);
      if (manualOverrides.has(sku)) {
        table.set(sku, manualOverrides.get(sku)!);
      } else {
        conflicts.push(conflict);
      }
      continue;
    }
    if (manualOverrides.has(sku)) {
      table.set(sku, manualOverrides.get(sku)!);
    } else {
      table.set(sku, canonicalCasing([...valueMap.values()][0]));
    }
  }

  return {
    table,
    conflicts,
    allConflicts,
    fromPreviousDecisions: [...previousDecisions.keys()],
  };
}

/** Manually-assigned decisions worth persisting for next session (conflicts resolved). */
export function manualSubCategoryDecisionsForExport(manualOverrides: Map<string, string>): SubCategoryDecision[] {
  return [...manualOverrides.entries()].map(([itemCode, subCategory]) => ({ itemCode, subCategory, manual: true }));
}
