import type { ColourKeyEntry, ColumnMapping, Inv01Row, LocationId, OrderRow, Sa79Row, SheetPreview } from "../types";
import { ALL_LOCATIONS } from "../types";
import type { StockColumnPair } from "./inv01LocationColumns";
import { toDate, toNumber, toText } from "./sheetLoad";
import { normalizeColourCode, parseStyleColourSize, resolveColourName } from "./referenceParse";

function get(row: Record<string, unknown>, mapping: ColumnMapping, key: string): unknown {
  const header = mapping[key];
  if (!header) return null;
  return row[header];
}

export function parseInv01(
  preview: SheetPreview,
  mapping: ColumnMapping,
  stockPairs: { pair: StockColumnPair; location: LocationId | null }[]
): Inv01Row[] {
  return preview.rows
    .map((row): Inv01Row | null => {
      const itemCode = toText(get(row, mapping, "itemCode"));
      // Real SAP-style exports append "TOTAL-", "TOTAL -ACCESSORIES", "TOTAL-BOSS" etc.
      // subtotal/grand-total rows with the running total sitting in the Item Code
      // column — never a real SKU, and would otherwise massively inflate every
      // report's stock totals if treated as one.
      if (!itemCode || itemCode.toUpperCase().startsWith("TOTAL")) return null;
      const stock: Inv01Row["stock"] = {};
      for (const { pair, location } of stockPairs) {
        if (!location) continue;
        stock[location] = {
          curStk: toNumber(row[pair.curStkHeader]) ?? 0,
          curStkCost: toNumber(row[pair.curStkCostHeader]) ?? 0,
        };
      }
      return {
        itemCode,
        brand: toText(get(row, mapping, "brand")),
        department: toText(get(row, mapping, "department")),
        category: toText(get(row, mapping, "category")),
        reference: toText(get(row, mapping, "reference")),
        itemDesc: toText(get(row, mapping, "itemDesc")),
        season: toText(get(row, mapping, "season")),
        product: toText(get(row, mapping, "product")),
        productSubGroup: toText(get(row, mapping, "productSubGroup")),
        ageingMths: toNumber(get(row, mapping, "ageingMths")),
        marketPrice: toNumber(get(row, mapping, "marketPrice")),
        itemCost: toNumber(get(row, mapping, "itemCost")),
        margin: toNumber(get(row, mapping, "margin")),
        stock,
      };
    })
    .filter((r): r is Inv01Row => r !== null);
}

function matchLocationByStoreName(storeName: string): LocationId | null {
  const norm = storeName.toLowerCase().trim();
  for (const loc of ALL_LOCATIONS) {
    if (norm === loc.sourceLabel.toLowerCase()) return loc.id;
  }
  // Fallback: fuzzy word-overlap match — real exports prefix Store Name with a
  // numeric store code (e.g. "001-JNS DEPARTMENT STORE - AL AALI MALL"), so an
  // exact match often fails. Score every location and take the BEST match
  // rather than the first one clearing a threshold: the two JDS locations share
  // 3 of their 4 words ("JNS DEPARTMENT STORE"), so a first-match-wins approach
  // can misattribute Al Aali Mall's sales to BCC (whichever is checked first).
  let best: { id: LocationId; score: number } | null = null;
  for (const loc of ALL_LOCATIONS) {
    const locWords = loc.sourceLabel.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const overlap = locWords.filter((w) => norm.includes(w)).length;
    const score = overlap / Math.max(locWords.length, 1);
    if (score >= 0.6 && (!best || score > best.score)) best = { id: loc.id, score };
  }
  return best ? best.id : null;
}

export function parseSa79(preview: SheetPreview, mapping: ColumnMapping, colourKey: Map<string, string>): Sa79Row[] {
  return preview.rows
    .map((row): Sa79Row | null => {
      const itemCode = toText(get(row, mapping, "itemCode"));
      // A trailing "Grand Total" row (no item code) is common in these exports — never a real sale.
      if (!itemCode) return null;
      const storeName = toText(get(row, mapping, "storeName"));
      const reference = toText(get(row, mapping, "reference"));
      const parsed = parseStyleColourSize(reference);
      const colourCode = parsed.colourCode;
      return {
        transactionDate: toDate(get(row, mapping, "transactionDate")),
        storeName,
        location: matchLocationByStoreName(storeName),
        itemCode,
        reference,
        season: toText(get(row, mapping, "season")),
        category: toText(get(row, mapping, "category")),
        itemSize: toText(get(row, mapping, "itemSize")) || parsed.size || "",
        rtp: toNumber(get(row, mapping, "rtp")),
        costPrice: toNumber(get(row, mapping, "costPrice")),
        qty: toNumber(get(row, mapping, "qty")) ?? 0,
        saleValue: toNumber(get(row, mapping, "saleValue")) ?? 0,
        costValue: toNumber(get(row, mapping, "costValue")) ?? 0,
        colourCode,
        colourName: resolveColourName(colourCode, colourKey),
        styleCode: parsed.style,
      };
    })
    .filter((r): r is Sa79Row => r !== null);
}

export function parseOrderOnTheWay(
  preview: SheetPreview,
  mapping: ColumnMapping,
  seasonDateOverrides: Record<string, Date | null>
): OrderRow[] {
  return preview.rows
    .map((row): OrderRow | null => {
      const line = toText(get(row, mapping, "ean")) || toText(get(row, mapping, "line"));
      if (!line) return null;
      const season = toText(get(row, mapping, "season"));
      const override = seasonDateOverrides[season];
      const expectedDeliveryDate = override !== undefined && override !== null ? override : toDate(get(row, mapping, "expectedDeliveryDate"));
      return {
        season,
        brand: toText(get(row, mapping, "brand")),
        line,
        colorCode: toText(get(row, mapping, "colorCode")),
        colorName: toText(get(row, mapping, "colorName")),
        size: toText(get(row, mapping, "size")),
        wholesalePrice: toNumber(get(row, mapping, "wholesalePrice")),
        expectedDeliveryDate,
        pendingUnitsQty: toNumber(get(row, mapping, "pendingUnitsQty")) ?? 0,
        pendingUnitsValue: toNumber(get(row, mapping, "pendingUnitsValue")) ?? 0,
        suggestedCategory: toText(get(row, mapping, "suggestedCategory")),
      };
    })
    .filter((r): r is OrderRow => r !== null);
}

export function parseColourKey(preview: SheetPreview, mapping: ColumnMapping): ColourKeyEntry[] {
  return preview.rows
    .map((row): ColourKeyEntry | null => {
      const code = toText(get(row, mapping, "code"));
      const name = toText(get(row, mapping, "name"));
      if (!code) return null;
      return { code, name };
    })
    .filter((r): r is ColourKeyEntry => r !== null);
}

export function colourKeyToMap(entries: ColourKeyEntry[]): Map<string, string> {
  const m = new Map<string, string>();
  // Colour codes are text ("002") when parsed from a Reference but often plain
  // numbers (2) in the Colour Key file itself — Excel drops leading zeros from a
  // numeric-typed cell. Normalize both sides (see resolveColourName) so they match.
  for (const e of entries) m.set(normalizeColourCode(e.code), e.name);
  return m;
}
