import { buildPreview, findHeaderRow, readWorkbookGrid, toText } from "./sheetLoad";
import { autoDetectMapping, COLOUR_KEY_FIELDS, INV01_FIELDS, ORDER_FIELDS, SA79_FIELDS } from "./columnMapping";
import { detectStockColumnPairs } from "./inv01LocationColumns";
import type { Inv01LoadedFile, LoadedFile } from "../state/appStore";
import type { LocationId } from "../types";

export async function loadInv01File(file: File): Promise<Inv01LoadedFile> {
  const grid = await readWorkbookGrid(file);
  const headerRowIndex = findHeaderRow(grid, ["Item Code"], 40);
  if (headerRowIndex === -1) throw new Error(`Could not locate the header row in ${file.name} (looking for "Item Code").`);
  const preview = buildPreview(grid, headerRowIndex);
  const mapping = autoDetectMapping(preview.headers, INV01_FIELDS);
  const stockPairs = detectStockColumnPairs(grid, headerRowIndex, preview.headers);
  const pairLocationOverride: Record<number, LocationId | null> = {};
  for (const p of stockPairs) pairLocationOverride[p.columnIndex] = p.guessedLocation;
  return { file, grid, headerRowIndex, preview, mapping, stockPairs, pairLocationOverride };
}

export async function loadSa79File(file: File): Promise<LoadedFile> {
  const grid = await readWorkbookGrid(file);
  let headerRowIndex = findHeaderRow(grid, ["Store Name"], 20);
  if (headerRowIndex === -1) headerRowIndex = 0;
  const preview = buildPreview(grid, headerRowIndex);
  const mapping = autoDetectMapping(preview.headers, SA79_FIELDS);
  return { file, grid, headerRowIndex, preview, mapping };
}

export async function loadOrderFile(file: File): Promise<LoadedFile> {
  const grid = await readWorkbookGrid(file);
  let headerRowIndex = findHeaderRow(grid, ["Season", "Expected delivery date"], 20);
  if (headerRowIndex === -1) headerRowIndex = findHeaderRow(grid, ["Season"], 20);
  if (headerRowIndex === -1) headerRowIndex = 3; // documented default row per spec
  const preview = buildPreview(grid, headerRowIndex);
  const mapping = autoDetectMapping(preview.headers, ORDER_FIELDS);
  return { file, grid, headerRowIndex, preview, mapping };
}

export async function loadColourKeyFile(file: File): Promise<LoadedFile> {
  const grid = await readWorkbookGrid(file);
  let headerRowIndex = findHeaderRow(grid, ["Row Labels"], 15);
  if (headerRowIndex === -1) headerRowIndex = 2; // documented default row per spec
  const preview = buildPreview(grid, headerRowIndex);
  const mapping = autoDetectMapping(preview.headers, COLOUR_KEY_FIELDS);
  return { file, grid, headerRowIndex, preview, mapping };
}

/** Previous "category decisions" file: simple Item Code | Category, header on row 1. */
export async function loadPreviousDecisions(file: File): Promise<Map<string, string>> {
  const grid = await readWorkbookGrid(file);
  const headerRowIndex = findHeaderRow(grid, ["Item Code"], 5) === -1 ? 0 : findHeaderRow(grid, ["Item Code"], 5);
  const preview = buildPreview(grid, headerRowIndex);
  const mapping = autoDetectMapping(preview.headers, [
    { key: "itemCode", label: "Item Code", required: true, aliases: ["item code"] },
    { key: "category", label: "Category", required: true, aliases: ["category"] },
  ]);
  const m = new Map<string, string>();
  for (const row of preview.rows) {
    const itemCode = mapping.itemCode ? toText(row[mapping.itemCode]) : "";
    const category = mapping.category ? toText(row[mapping.category]) : "";
    if (itemCode && category) m.set(itemCode, category);
  }
  return m;
}
