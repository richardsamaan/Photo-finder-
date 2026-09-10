import type { CategoryConflict, CategoryDecision, Inv01Row, OrderRow, Sa79Row } from "../types";

export interface CategorySource {
  itemCode: string;
  category: string;
  source: string; // e.g. "INV01" | "SA79"
}

/** Collect every (itemCode -> category) observation from the files loaded this session. */
export function collectCategorySources(inv01: Inv01Row[], sa79: Sa79Row[]): CategorySource[] {
  const out: CategorySource[] = [];
  for (const r of inv01) {
    if (r.itemCode && r.category) out.push({ itemCode: r.itemCode, category: r.category, source: "INV01" });
  }
  for (const r of sa79) {
    if (r.itemCode && r.category) out.push({ itemCode: r.itemCode, category: r.category, source: "SA79" });
  }
  return out;
}

export interface CategoryResolutionResult {
  /** Final SKU -> category table (only entries that are safe to use in reports). */
  table: Map<string, string>;
  /** SKUs where INV01 and SA79 disagree on category — must be resolved manually before reports run. */
  conflicts: CategoryConflict[];
  /** New-to-this-session SKUs from Order on the way, needing a confirm/override before use. */
  newFromOrders: { itemCode: string; suggestedCategory: string }[];
  /** SKUs already covered by a loaded "previous category decisions" file. */
  fromPreviousDecisions: string[];
}

/**
 * Build the SKU -> Category table. Does NOT auto-resolve conflicts — those
 * are surfaced for a human to pick, and are excluded from `table` until resolved
 * (via `manualOverrides`). `manualOverrides` also carries confirmed values for
 * new Order-on-the-way SKUs and previously-downloaded decisions.
 */
export function resolveCategories(
  sources: CategorySource[],
  orderRows: OrderRow[],
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

  // previous decisions are pre-filled first (lowest precedence — a fresh
  // conflict or manual override this session still wins if present).
  for (const [sku, cat] of previousDecisions) table.set(sku, cat);

  for (const [sku, catMap] of bySku) {
    if (manualOverrides.has(sku)) {
      table.set(sku, manualOverrides.get(sku)!);
      continue;
    }
    if (catMap.size === 1) {
      table.set(sku, [...catMap.keys()][0]);
    } else {
      conflicts.push({
        itemCode: sku,
        candidates: [...catMap.entries()].map(([category, srcs]) => ({
          source: [...srcs].join(", "),
          category,
        })),
      });
    }
  }

  // Order-on-the-way SKUs not yet covered by any resolved category.
  const newFromOrders: { itemCode: string; suggestedCategory: string }[] = [];
  const seenOrderSkus = new Set<string>();
  for (const o of orderRows) {
    if (!o.line || seenOrderSkus.has(o.line)) continue;
    seenOrderSkus.add(o.line);
    if (table.has(o.line)) continue;
    if (manualOverrides.has(o.line)) {
      table.set(o.line, manualOverrides.get(o.line)!);
      continue;
    }
    newFromOrders.push({ itemCode: o.line, suggestedCategory: o.suggestedCategory });
  }

  return {
    table,
    conflicts,
    newFromOrders,
    fromPreviousDecisions: [...previousDecisions.keys()],
  };
}

/** Manually-assigned decisions worth persisting for next session (conflicts resolved + new-item confirmations). */
export function manualDecisionsForExport(manualOverrides: Map<string, string>): CategoryDecision[] {
  return [...manualOverrides.entries()].map(([itemCode, category]) => ({ itemCode, category, manual: true }));
}
