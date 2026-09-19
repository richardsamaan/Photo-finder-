import type { CategoryConflict, CategoryDecision, Inv01Row, OrderRow, Sa79Row } from "../types";

export interface CategorySource {
  itemCode: string;
  category: string;
  source: string; // e.g. "INV01" | "SA79" | "Order"
}

/**
 * Collect every (itemCode -> category) observation from the files loaded this
 * session. Order on the way is a first-class source here, exactly like
 * INV01/SA79 — its own "Category Indecater" column is resolved through the
 * same conflict/consensus mechanism below, not treated as a lower-trust
 * suggestion requiring separate confirmation.
 */
export function collectCategorySources(inv01: Inv01Row[], sa79: Sa79Row[], orders: OrderRow[]): CategorySource[] {
  const out: CategorySource[] = [];
  for (const r of inv01) {
    if (r.itemCode && r.category) out.push({ itemCode: r.itemCode, category: r.category, source: "INV01" });
  }
  for (const r of sa79) {
    if (r.itemCode && r.category) out.push({ itemCode: r.itemCode, category: r.category, source: "SA79" });
  }
  for (const r of orders) {
    if (r.line && r.category) out.push({ itemCode: r.line, category: r.category, source: "Order" });
  }
  return out;
}

export interface CategoryResolutionResult {
  /** Final SKU -> category table (only entries that are safe to use in reports). */
  table: Map<string, string>;
  /** SKUs where two or more sources disagree on category and no decision (bulk or individual) has been made yet this session — must be resolved before reports run. */
  conflicts: CategoryConflict[];
  /** Every SKU where two or more sources disagree, whether resolved yet or not — for review UI. A resolved one's current value lives in `manualOverrides`, not here. */
  allConflicts: CategoryConflict[];
  /** SKUs already covered by a loaded "previous category decisions" file. */
  fromPreviousDecisions: string[];
}

/**
 * Build the SKU -> Category table. Does NOT auto-resolve conflicts — those
 * are surfaced for a human to pick, and are excluded from `table` until resolved
 * (via `manualOverrides`). `manualOverrides` also carries confirmed values for
 * previously-downloaded decisions.
 */
export function resolveCategories(
  sources: CategorySource[],
  manualOverrides: Map<string, string>,
  previousDecisions: Map<string, string>
): CategoryResolutionResult {
  const bySku = new Map<string, Map<string, Set<string>>>(); // itemCode -> category -> sources
  for (const s of sources) {
    if (!bySku.has(s.itemCode)) bySku.set(s.itemCode, new Map());
    const catMap = bySku.get(s.itemCode)!;
    if (!catMap.has(s.category)) catMap.set(s.category, new Set());
    catMap.get(s.category)!.add(s.source);
  }

  const table = new Map<string, string>();
  const conflicts: CategoryConflict[] = [];
  const allConflicts: CategoryConflict[] = [];

  // previous decisions are pre-filled first (lowest precedence — a fresh
  // conflict or manual override this session still wins if present).
  for (const [sku, cat] of previousDecisions) table.set(sku, cat);

  for (const [sku, catMap] of bySku) {
    if (catMap.size > 1) {
      const conflict: CategoryConflict = {
        itemCode: sku,
        candidates: [...catMap.entries()].map(([category, srcs]) => ({
          source: [...srcs].join(", "),
          category,
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
      table.set(sku, [...catMap.keys()][0]);
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
export function manualDecisionsForExport(manualOverrides: Map<string, string>): CategoryDecision[] {
  return [...manualOverrides.entries()].map(([itemCode, category]) => ({ itemCode, category, manual: true }));
}
