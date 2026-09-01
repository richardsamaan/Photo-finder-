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

const COLOUR_ALIASES = ["colour", "color", "colourway", "shade"];

const CATEGORY_ALIASES = [
  "category",
  "product category",
  "productcategory",
  "type",
  "product type",
  "department",
];

export interface ColumnMapping {
  styleCode: string | null;
  colour: string | null;
  category: string | null;
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
  const colour = findBestMatch(headers, COLOUR_ALIASES);
  const category = findBestMatch(headers, CATEGORY_ALIASES);

  const confident = Boolean(styleCode && colour && category);

  return { styleCode, colour, category, confident };
}
