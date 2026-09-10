import { ALL_LOCATIONS, type LocationId } from "../types";

export interface StockColumnPair {
  /** Index into the header row (0-based). */
  columnIndex: number;
  curStkHeader: string;
  curStkCostHeader: string;
  /** Text found in the row above the header row at this column, if any. */
  labelAbove: string | null;
  /** Best-guess location match; user confirms/reassigns in the UI. */
  guessedLocation: LocationId | null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function guessLocation(label: string | null): LocationId | null {
  if (!label) return null;
  const norm = normalize(label);
  if (!norm) return null;
  let best: { id: LocationId; score: number } | null = null;
  for (const loc of ALL_LOCATIONS) {
    const locNorm = normalize(loc.inv01Label ?? loc.sourceLabel);
    const locWords = locNorm.split(" ").filter((w) => w.length > 2);
    const matchCount = locWords.filter((w) => norm.includes(w)).length;
    const score = matchCount / Math.max(locWords.length, 1);
    if (score > 0 && (!best || score > best.score)) best = { id: loc.id, score };
  }
  return best && best.score >= 0.4 ? best.id : null;
}

/**
 * Find every "Cur Stk" / "Cur Stk Cost" column pair in the INV01 header row,
 * and guess which location each belongs to by reading the merged-cell label
 * text in the row directly above the header row.
 */
export function detectStockColumnPairs(grid: unknown[][], headerRowIndex: number, headers: string[]): StockColumnPair[] {
  const aboveRow = headerRowIndex > 0 ? grid[headerRowIndex - 1] ?? [] : [];
  const pairs: StockColumnPair[] = [];

  for (let i = 0; i < headers.length; i++) {
    const h = normalize(headers[i]);
    const isCurStk = /\bcur ?stk\b/.test(h) && !/cost/.test(h);
    if (!isCurStk) continue;
    // Expect the cost column to immediately follow (or be nearby).
    let costIndex = -1;
    for (let j = i + 1; j < Math.min(i + 3, headers.length); j++) {
      const hj = normalize(headers[j]);
      if (/\bcur ?stk\b/.test(hj) && /cost/.test(hj)) {
        costIndex = j;
        break;
      }
    }
    if (costIndex === -1) continue;

    // Look for a label in the row above, scanning left-to-right from this
    // column (merged cells usually leave the label in the first cell of the span).
    let labelAbove: string | null = null;
    for (let k = i; k >= 0 && k >= i - 6; k--) {
      const cell = aboveRow[k];
      if (cell != null && String(cell).trim() !== "") {
        labelAbove = String(cell).trim();
        break;
      }
    }

    pairs.push({
      columnIndex: i,
      curStkHeader: headers[i],
      curStkCostHeader: headers[costIndex],
      labelAbove,
      guessedLocation: guessLocation(labelAbove),
    });
  }

  return pairs;
}
