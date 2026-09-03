import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { env } from "../env.js";
import { sanitizeCategoryFolder } from "../lib/sanitize.js";
import { resolveStoragePath } from "./imageStorage.js";
import type { products as productsTable } from "../db/schema.js";

type ProductRow = typeof productsTable.$inferSelect;

const PAGE_MARGIN = 50;
const GRID_COLS = 3;
const GRID_ROWS = 3;
const TILE_GAP = 12;

export function catalogsDir(jobId: string): string {
  // Same root as imageStorage.catalogRoot's parent - PDFs and images share one tree.
  return path.join(env.STORAGE_DIR, "catalog", jobId);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Sort products by Season (blank seasons sort last), for display within a category group. */
export function sortBySeason(list: ProductRow[]): ProductRow[] {
  return [...list].sort((a, b) => {
    const sa = a.season?.trim() ?? "";
    const sb = b.season?.trim() ?? "";
    if (!sa && !sb) return 0;
    if (!sa) return 1;
    if (!sb) return -1;
    return sa.localeCompare(sb);
  });
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * pdfkit's fill colour accepts hex/rgb and a fair number of CSS colour
 * keywords - a common Colour value like "Black" or "Navy" resolves directly.
 * Crucially, pdfkit does NOT throw on an unrecognised name (e.g. a compound
 * name like "Dark Olive Green") - it silently no-ops and leaves whatever
 * fill colour was already active, which would misleadingly tint the swatch
 * with an unrelated colour. `_normalizeColor` is pdfkit's own (undocumented)
 * resolver, used here purely to detect that case up front and fall back to
 * a neutral swatch instead.
 */
function drawColourSwatch(doc: PDFKit.PDFDocument, colour: string, x: number, y: number, size: number) {
  const candidate = colour.trim().toLowerCase().replace(/\s+/g, "");
  const recognized = Boolean((doc as any)._normalizeColor(candidate));
  doc.rect(x, y, size, size).fill(recognized ? candidate : "#cccccc");
}

function drawProductTile(doc: PDFKit.PDFDocument, product: ProductRow, x: number, y: number, w: number, h: number) {
  doc.rect(x, y, w, h).stroke("#e2e8f0");

  const textBlockHeight = 46;
  const imageAreaHeight = h - textBlockHeight - 8;
  const innerX = x + 6;
  const innerW = w - 12;

  if (product.localImagePath) {
    const absPath = resolveStoragePath(product.localImagePath);
    if (fs.existsSync(absPath)) {
      try {
        doc.image(absPath, innerX, y + 6, { fit: [innerW, imageAreaHeight], align: "center", valign: "center" });
      } catch {
        doc
          .fontSize(8)
          .fillColor("#999999")
          .text("(image could not be rendered)", innerX, y + 6 + imageAreaHeight / 2, { width: innerW, align: "center" });
      }
    }
  } else {
    doc
      .fontSize(8)
      .fillColor("#999999")
      .text("No approved image", innerX, y + 6 + imageAreaHeight / 2, { width: innerW, align: "center" });
  }

  let textY = y + 6 + imageAreaHeight + 6;
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#111111").text(product.styleCode, innerX, textY, { width: innerW });

  textY += 13;
  const swatchSize = 9;
  drawColourSwatch(doc, product.colour, innerX, textY + 1, swatchSize);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#333333")
    .text(product.colour, innerX + swatchSize + 5, textY, { width: innerW - swatchSize - 5 });

  if (product.season) {
    textY += 12;
    doc.fontSize(7).fillColor("#888888").text(product.season, innerX, textY, { width: innerW });
  }
}

/** Draws as many grid pages as needed to fit every product, GRID_COLS x GRID_ROWS tiles per page. */
function drawProductGrid(doc: PDFKit.PDFDocument, productsList: ProductRow[]) {
  const pageWidth = doc.page.width - PAGE_MARGIN * 2;
  const pageHeight = doc.page.height - PAGE_MARGIN * 2;
  const tileW = (pageWidth - TILE_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const tileH = (pageHeight - TILE_GAP * (GRID_ROWS - 1)) / GRID_ROWS;
  const perPage = GRID_COLS * GRID_ROWS;

  for (const page of chunk(productsList, perPage)) {
    doc.addPage();
    page.forEach((product, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = PAGE_MARGIN + col * (tileW + TILE_GAP);
      const y = PAGE_MARGIN + row * (tileH + TILE_GAP);
      drawProductTile(doc, product, x, y, tileW, tileH);
    });
  }
}

function drawCoverPage(
  doc: PDFKit.PDFDocument,
  opts: { title: string; totalProducts: number; totalCategories: number }
) {
  doc.addPage();
  doc.fontSize(28).font("Helvetica-Bold").fillColor("#111111");
  doc.text(opts.title, { align: "center" });
  doc.moveDown(2);
  doc.fontSize(14).font("Helvetica").fillColor("#333333");
  doc.text(`Date: ${new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}`, {
    align: "center",
  });
  doc.moveDown(0.5);
  doc.text(`Number of Products: ${opts.totalProducts}`, { align: "center" });
  doc.moveDown(0.5);
  doc.text(`Number of Categories: ${opts.totalCategories}`, { align: "center" });
}

function drawCategoryDivider(doc: PDFKit.PDFDocument, category: string, count: number) {
  doc.addPage();
  doc.fontSize(24).font("Helvetica-Bold").fillColor("#111111");
  doc.text(category, { align: "center", baseline: "middle" });
  doc.moveDown(1);
  doc.fontSize(12).font("Helvetica").fillColor("#666666");
  doc.text(`${count} product${count === 1 ? "" : "s"}`, { align: "center" });
}

/** Generate a single-category PDF: Product_Catalog/<Category>/<Category>.pdf - a grid sorted by Season. */
export async function generateCategoryPdf(
  jobId: string,
  category: string,
  productsInCategory: ProductRow[]
): Promise<string> {
  const safeCategory = sanitizeCategoryFolder(category);
  const dir = path.join(catalogsDir(jobId), "Product_Catalog", safeCategory);
  ensureDir(dir);
  const outPath = path.join(dir, `${safeCategory}.pdf`);

  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, autoFirstPage: false });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  drawCoverPage(doc, { title: category, totalProducts: productsInCategory.length, totalCategories: 1 });
  drawProductGrid(doc, sortBySeason(productsInCategory));

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  return outPath;
}

/**
 * Generate the master catalog PDF covering every category - grouped by
 * category, sorted by Season within each group. Always regenerated fresh
 * from the job's current approved products, so re-running this after any
 * day's search run produces one up-to-date, cumulative catalog rather than
 * a separate file per day.
 */
export async function generateMasterPdf(
  jobId: string,
  byCategory: Map<string, ProductRow[]>
): Promise<string> {
  const dir = path.join(catalogsDir(jobId), "Product_Catalog");
  ensureDir(dir);
  const outPath = path.join(dir, "Product_Image_Catalog.pdf");

  const totalProducts = Array.from(byCategory.values()).reduce((sum, list) => sum + list.length, 0);

  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, autoFirstPage: false });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  drawCoverPage(doc, {
    title: "Product Image Catalog",
    totalProducts,
    totalCategories: byCategory.size,
  });

  for (const [category, categoryProducts] of byCategory) {
    drawCategoryDivider(doc, category, categoryProducts.length);
    drawProductGrid(doc, sortBySeason(categoryProducts));
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  return outPath;
}
