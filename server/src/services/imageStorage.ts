import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { env } from "../env.js";
import { fetchWithTimeout } from "../lib/httpFetch.js";
import { assertSafeExternalUrl } from "../lib/validateUrl.js";
import { sanitizeCategoryFolder, buildImageFilename, isPathInside } from "../lib/sanitize.js";

export const CATALOG_ROOT_NAME = "Product_Catalog";

// Images and generated PDFs both live under this single per-job tree so the
// ZIP export can bundle the folder as-is with no copying required.
export function catalogRoot(jobId: string): string {
  return path.join(env.STORAGE_DIR, "catalog", jobId, CATALOG_ROOT_NAME);
}

export function categoryDir(jobId: string, category: string): string {
  const dir = path.join(catalogRoot(jobId), sanitizeCategoryFolder(category));
  if (!isPathInside(catalogRoot(jobId), dir)) throw new Error("Invalid category path.");
  return dir;
}

/**
 * Download an image from a remote URL, validate it's actually an image,
 * convert to a consistent JPEG (preserving quality) unless it's already a
 * JPEG, and save it under Product_Catalog/<Category>/STYLECODE-COLOUR.jpg
 */
export async function downloadAndStoreImage(params: {
  jobId: string;
  category: string;
  styleCode: string;
  colour: string;
  sourceUrl: string;
}): Promise<{ localPath: string; relativePath: string; width: number; height: number; bytes: number }> {
  const { jobId, category, styleCode, colour, sourceUrl } = params;

  const safeUrl = await assertSafeExternalUrl(sourceUrl);
  const res = await fetchWithTimeout(safeUrl.toString());
  if (!res.ok) throw new Error(`Failed to download image (HTTP ${res.status})`);

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`URL did not return an image (content-type: ${contentType || "unknown"})`);
  }
  const contentLength = Number(res.headers.get("content-length") ?? "0");
  if (contentLength && contentLength > env.MAX_IMAGE_MB * 1024 * 1024) {
    throw new Error(`Image exceeds max size of ${env.MAX_IMAGE_MB}MB.`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength > env.MAX_IMAGE_MB * 1024 * 1024) {
    throw new Error(`Image exceeds max size of ${env.MAX_IMAGE_MB}MB.`);
  }

  return persistImageBuffer({ jobId, category, styleCode, colour, buffer });
}

export async function persistImageBuffer(params: {
  jobId: string;
  category: string;
  styleCode: string;
  colour: string;
  buffer: Buffer;
}): Promise<{ localPath: string; relativePath: string; width: number; height: number; bytes: number }> {
  const { jobId, category, styleCode, colour, buffer } = params;

  const image = sharp(buffer, { failOn: "none" });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("File is not a valid image.");
  }

  const dir = categoryDir(jobId, category);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = buildImageFilename(styleCode, colour, "jpg");
  const localPath = path.join(dir, filename);
  if (!isPathInside(catalogRoot(jobId), localPath)) throw new Error("Invalid file path.");

  let pipeline = image.rotate(); // auto-orient
  if (metadata.format !== "jpeg") {
    pipeline = pipeline.jpeg({ quality: 90 });
  } else {
    pipeline = pipeline.jpeg({ quality: 95 });
  }
  const outBuffer = await pipeline.toBuffer();
  fs.writeFileSync(localPath, outBuffer);

  const relativePath = path.relative(env.STORAGE_DIR, localPath);

  return {
    localPath,
    relativePath,
    width: metadata.width,
    height: metadata.height,
    bytes: outBuffer.byteLength,
  };
}

export function resolveStoragePath(relativePath: string): string {
  return path.join(env.STORAGE_DIR, relativePath);
}

export function deleteStoredImage(localPath: string) {
  try {
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch {
    /* ignore */
  }
}
