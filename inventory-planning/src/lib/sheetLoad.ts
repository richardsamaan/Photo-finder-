import * as XLSX from "xlsx";
import type { SheetPreview } from "../types";

/** Read the first (or named) worksheet of an uploaded file into a raw 2D array. */
export async function readWorkbookGrid(file: File, sheetName?: string): Promise<unknown[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: true });
  const name = sheetName ?? wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`Sheet "${name}" not found in ${file.name}`);
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  return grid;
}

/**
 * Locate the header row by scanning for one that contains all of `mustContain`
 * (case-insensitive substring match against cell text). Returns the 0-indexed
 * row number, or -1 if not found within `maxScan` rows.
 */
export function findHeaderRow(grid: unknown[][], mustContain: string[], maxScan = 30): number {
  const needles = mustContain.map((s) => s.toLowerCase());
  const limit = Math.min(grid.length, maxScan);
  for (let r = 0; r < limit; r++) {
    const row = grid[r] ?? [];
    const cellsLower = row.map((c) => (c == null ? "" : String(c).toLowerCase()));
    const allFound = needles.every((needle) => cellsLower.some((cell) => cell.includes(needle)));
    if (allFound) return r;
  }
  return -1;
}

/** Build a SheetPreview from a raw grid + known header row index. */
export function buildPreview(grid: unknown[][], headerRowIndex: number, sampleSize = 5): SheetPreview {
  const headerRow = grid[headerRowIndex] ?? [];
  const rawHeaders = headerRow.map((h, i) => (h == null || String(h).trim() === "" ? `Column ${i + 1}` : String(h).trim()));
  // De-duplicate repeated header text (e.g. 3x "Cur Stk" / "Cur Stk Cost" pairs, one per
  // location) so each column keeps its own value instead of later columns overwriting earlier ones.
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const count = seen.get(h) ?? 0;
    seen.set(h, count + 1);
    return count === 0 ? h : `${h} (${count + 1})`;
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const raw = grid[r];
    if (!raw || raw.every((c) => c == null || String(c).trim() === "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = raw[i] ?? null;
    });
    rows.push(obj);
  }

  return {
    headers,
    headerRowIndex,
    rows,
    sampleRows: rows.slice(0, sampleSize),
  };
}

/** Force a value to a trimmed text string (used for matching-key columns to avoid numeric coercion / lost leading zeros). */
export function toText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

export function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H ?? 0, d.M ?? 0, d.S ?? 0));
  }
  const parsed = new Date(String(v));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
