import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { env } from "../env.js";
import { sanitizeCategoryFolder } from "../lib/sanitize.js";
import { resolveStoragePath } from "./imageStorage.js";
import type { products as productsTable } from "../db/schema.js";

type ProductRow = typeof productsTable.$inferSelect;

const PAGE_MARGIN = 50;

export function catalogsDir(jobId: string): string {
  // Same root as imageStorage.catalogRoot's parent - PDFs and images share one tree.
  return path.join(env.STORAGE_DIR, "catalog", jobId);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function drawProductPage(doc: PDFKit.PDFDocument, product: ProductRow) {
  doc.addPage();
  const pageWidth = doc.page.width - PAGE_MARGIN * 2;
  const imageAreaHeight = doc.page.height - PAGE_MARGIN * 2 - 120;

  if (product.localImagePath) {
    const absPath = resolveStoragePath(product.localImagePath);
    if (fs.existsSync(absPath)) {
      try {
        doc.image(absPath, PAGE_MARGIN, PAGE_MARGIN, {
          fit: [pageWidth, imageAreaHeight],
          align: "center",
          valign: "center",
        });
      } catch {
        doc
          .fontSize(12)
          .fillColor("#888")
          .text("(Image could not be rendered)", PAGE_MARGIN, PAGE_MARGIN + imageAreaHeight / 2);
      }
    }
  } else {
    doc
      .rect(PAGE_MARGIN, PAGE_MARGIN, pageWidth, imageAreaHeight)
      .stroke("#cccccc")
      .fontSize(12)
      .fillColor("#999")
      .text("No approved image", PAGE_MARGIN, PAGE_MARGIN + imageAreaHeight / 2, {
        width: pageWidth,
        align: "center",
      });
  }

  const infoY = PAGE_MARGIN + imageAreaHeight + 20;
  doc
    .fillColor("#111111")
    .fontSize(16)
    .font("Helvetica-Bold")
    .text(`Style Code: ${product.styleCode}`, PAGE_MARGIN, infoY);
  doc
    .fontSize(13)
    .font("Helvetica")
    .fillColor("#333333")
    .text(`Colour: ${product.colour}`, PAGE_MARGIN, infoY + 24)
    .text(`Category: ${product.category}`, PAGE_MARGIN, infoY + 44);
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

/** Generate a single-category PDF: Product_Catalog/<Category>/<Category>.pdf */
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
  for (const product of productsInCategory) {
    drawProductPage(doc, product);
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  return outPath;
}

/** Generate the master catalog PDF covering every category. */
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
    for (const product of categoryProducts) {
      drawProductPage(doc, product);
    }
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  return outPath;
}
