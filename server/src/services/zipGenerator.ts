import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import { catalogsDir } from "./pdfGenerator.js";
import { CATALOG_ROOT_NAME } from "./imageStorage.js";

export async function generateCatalogZip(jobId: string): Promise<string> {
  const root = path.join(catalogsDir(jobId), CATALOG_ROOT_NAME);
  if (!fs.existsSync(root)) {
    throw new Error("No catalog has been generated yet. Approve products and generate PDFs first.");
  }

  const zipPath = path.join(catalogsDir(jobId), "Product_Catalog.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    archive.on("error", reject);
  });

  archive.pipe(output);
  archive.directory(root, CATALOG_ROOT_NAME);
  await archive.finalize();
  await done;

  return zipPath;
}
