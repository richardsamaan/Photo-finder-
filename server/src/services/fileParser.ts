import * as XLSX from "xlsx";

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseSpreadsheet(buffer: Buffer, originalName: string): ParsedSheet {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("The file has no sheets/data.");
  const sheet = wb.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
    defval: "",
    raw: false,
  });

  if (rows.length === 0) {
    throw new Error("No data rows found in the file.");
  }

  const headers = Object.keys(rows[0]);
  const stringRows = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = String(row[h] ?? "").trim();
    return out;
  });

  return { headers, rows: stringRows };
}

// --- Column auto-detection ---

const STYLE_CODE_ALIASES = [
  "style code",
  "stylecode",
  "style",
  "reference",
  "ref",
  "sku",
  "product code",
  "productcode",
  "code",
  "item code",
  "article number",
  "article no",
  "style ref",
];

const COLOUR_ALIASES = ["colour name", "color name", "colour", "color", "colourway", "shade"];

// Checked before COLOUR_ALIASES and excluded from its candidates (see
// detectColumns) - "colour code" contains "colour" as a substring, so
// without that exclusion the colour-name detector's fallback "contains"
// match could grab the code column instead of (or as well as) the name one.
const COLOUR_CODE_ALIASES = [
  "colour code",
  "color code",
  "colourway code",
  "colour no",
  "color no",
  "shade code",
];

const CATEGORY_ALIASES = [
  "category",
  "product category",
  "productcategory",
  "type",
  "product type",
  "department",
  "product group",
  "line",
];

const SEASON_ALIASES = [
  "season",
  "collection season",
  "seasonal collection",
  "collection",
  "ss/aw",
  "drop",
];

export interface ColumnMapping {
  styleCode: string | null;
  colour: string | null;
  /** Optional - does not affect `confident`. */
  colourCode: string | null;
  category: string | null;
  /** Optional - does not affect `confident`. */
  season: string | null;
  confident: boolean;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
}

function findBestMatch(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => ({ original: h, norm: normalizeHeader(h) }));

  // exact match first
  for (const alias of aliases) {
    const hit = normalized.find((h) => h.norm === alias);
    if (hit) return hit.original;
  }
  // contains match
  for (const alias of aliases) {
    const hit = normalized.find((h) => h.norm.includes(alias));
    if (hit) return hit.original;
  }
  return null;
}

export function detectColumns(headers: string[]): ColumnMapping {
  const styleCode = findBestMatch(headers, STYLE_CODE_ALIASES);
  // Detected first and excluded from the colour-name candidates below, so
  // a "Colour Code" column can never be mistaken for the colour-name one.
  const colourCode = findBestMatch(headers, COLOUR_CODE_ALIASES);
  const colour = findBestMatch(
    headers.filter((h) => h !== colourCode),
    COLOUR_ALIASES
  );
  const category = findBestMatch(headers, CATEGORY_ALIASES);
  const season = findBestMatch(headers, SEASON_ALIASES);

  // styleCode/colour/category remain required for a "confident" auto-mapping;
  // colourCode and season are optional columns and never block that.
  const confident = Boolean(styleCode && colour && category);

  return { styleCode, colour, colourCode, category, season, confident };
}
