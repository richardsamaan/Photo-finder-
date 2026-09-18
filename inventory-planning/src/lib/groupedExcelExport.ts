import ExcelJS from "exceljs";

// Professional Excel export with native row outline/grouping (the same
// feature PivotTables use, with +/- controls in the left margin) so a
// Category row (or block of category rows, for Size/Colour) can be expanded
// to reveal its Sub Category (and, for Risk Flagging, SKU) rows nested
// underneath, collapsed by default.
//
// The plain `xlsx` package (SheetJS Community Edition, used elsewhere in this
// app for flat exports) silently drops cell styling — bold, fills, borders —
// on write; only its paid Pro tier supports that. ExcelJS (MIT-licensed)
// supports styling, outline levels, and freeze panes, so it's used here
// specifically for these grouped/formatted exports.

export interface GroupedExportColumn {
  header: string;
  key: string;
  width?: number;
  /** Excel display format for a numeric/date cell (e.g. "yyyy-mm-dd", '0.0" months"') — value stays a native number/Date, only its on-screen formatting changes. */
  numFmt?: string;
  /** Use only to derive a plain-text display value (e.g. joining a number with a label) — prefer numFmt for numbers/dates so Excel keeps them sortable/summable. */
  format?: (value: unknown) => string;
}

export type RiskTierColor = "red" | "green" | "blue";

export interface GroupedExportRow {
  cells: Record<string, unknown>;
  /** Outline depth: 0 = always visible; >0 = collapsed/hidden by default under the nearest preceding lower-level row. */
  level: number;
  /** When set, the cell in `tierColumnKey` gets this tier's background/text colour. */
  tier?: RiskTierColor;
  /** Defaults to true for level 0, false otherwise. */
  bold?: boolean;
}

const TIER_COLORS: Record<RiskTierColor, { bg: string; fg: string }> = {
  // Matches src/styles.css badge colours exactly (--red/--red-bg etc.)
  red: { bg: "FFFEE2E2", fg: "FFDC2626" },
  green: { bg: "FFDCFCE7", fg: "FF16A34A" },
  blue: { bg: "FFDBEAFE", fg: "FF2563EB" },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};

function autoFitWidth(header: string, values: string[]): number {
  const longest = values.reduce((max, v) => Math.max(max, v.length), header.length);
  return Math.min(Math.max(longest + 2, 8), 60);
}

function cellDisplayText(raw: unknown, col: GroupedExportColumn): string {
  if (col.format) return col.format(raw);
  if (raw == null) return "";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw);
}

function columnWidths(rows: GroupedExportRow[], columns: GroupedExportColumn[]): number[] {
  return columns.map((col, i) => {
    if (col.width) return col.width;
    const values = rows.map((r) => cellDisplayText(r.cells[col.key], col));
    return autoFitWidth(col.header, values);
  });
}

/**
 * Export one Excel sheet with native outline grouping. `rows` is a flat,
 * pre-ordered list — each row's `level` says how deep it nests (0 = always
 * visible; a run of level-N rows following a level-(N-1) row collapses under
 * it). Building the flat list (rather than a tree) keeps this shared writer
 * simple and lets each report flatten its own shape — Category
 * Study/Profitability have one summary row per group, Risk Flagging nests
 * two levels deep, and Size/Colour has no single summary row per category
 * (many size/colour rows each) so its own code emits a labelled divider row
 * per group instead.
 */
export async function exportGroupedExcel(
  filename: string,
  sheetName: string,
  columns: GroupedExportColumn[],
  rows: GroupedExportRow[],
  options?: { tierColumnKey?: string }
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31), {
    properties: { outlineProperties: { summaryBelow: false, summaryRight: false } },
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headerRow = ws.addRow(columns.map((c) => c.header));
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.border = THIN_BORDER;
  });

  const tierColumnIndex = options?.tierColumnKey ? columns.findIndex((c) => c.key === options.tierColumnKey) : -1;

  for (const row of rows) {
    const values = columns.map((col) => {
      const raw = row.cells[col.key];
      if (col.format) return col.format(raw);
      return raw ?? null;
    });
    const excelRow = ws.addRow(values);
    columns.forEach((col, i) => {
      if (col.numFmt) excelRow.getCell(i + 1).numFmt = col.numFmt;
    });
    if (row.level > 0) {
      excelRow.outlineLevel = row.level;
      excelRow.hidden = true;
    }
    excelRow.eachCell((cell) => {
      cell.border = THIN_BORDER;
    });
    if (row.bold ?? row.level === 0) {
      excelRow.font = { bold: true };
    }
    if (row.tier && tierColumnIndex >= 0) {
      const cell = excelRow.getCell(tierColumnIndex + 1);
      const colors = TIER_COLORS[row.tier];
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.bg } };
      cell.font = { color: { argb: colors.fg }, bold: row.bold ?? row.level === 0 };
    }
  }

  const widths = columnWidths(rows, columns);
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
