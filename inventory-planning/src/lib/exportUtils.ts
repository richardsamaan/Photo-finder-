import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportColumn {
  header: string;
  key: string;
  /** Optional formatter for display (Excel gets the raw value; PDF gets the formatted string). */
  format?: (value: unknown) => string;
}

function readField(row: object, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

export function exportToExcel<T extends object>(filename: string, sheetName: string, columns: ExportColumn[], rows: readonly T[]) {
  const data = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const col of columns) out[col.header] = readField(row, col.key) ?? "";
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.header) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

export function exportMultiSheetExcel(filename: string, sheets: { name: string; columns: ExportColumn[]; rows: readonly object[] }[]) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const data = sheet.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of sheet.columns) out[col.header] = readField(row, col.key) ?? "";
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: sheet.columns.map((c) => c.header) });
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export function exportToPdf<T extends object>(
  filename: string,
  title: string,
  subtitle: string | null,
  columns: ExportColumn[],
  rows: readonly T[]
) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  let startY = 22;
  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(subtitle, 14, 22);
    startY = 28;
  }

  const head = [columns.map((c) => c.header)];
  const body = rows.map((row) => columns.map((c) => (c.format ? c.format(readField(row, c.key)) : String(readField(row, c.key) ?? ""))));

  autoTable(doc, {
    head,
    body,
    startY,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: 14, right: 14 },
  });

  doc.save(filename);
}

export function fmtNumber(v: unknown): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function fmtMoney(v: unknown): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toFixed(1)}%`;
}

export function fmtMonths(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toFixed(1)} months`;
}

export function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}
