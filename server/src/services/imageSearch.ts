import sharp from "sharp";
import pLimit from "p-limit";
import { env } from "../env.js";
import { domainOf, fetchWithTimeout } from "../lib/httpFetch.js";
import { assertSafeExternalUrl } from "../lib/validateUrl.js";
import { buildQuickSearchQueries } from "./queryBuilder.js";
import { getActiveProvider, isSearchConfigured, runSearch } from "./searchProviders/index.js";
import { ProviderNotConfiguredError } from "./searchProviders/types.js";
import { searchImages as googleSearchImages } from "./searchProviders/googleCse.js";
import { searchImages as bingSearchImages } from "./searchProviders/bing.js";
import type { RawImageResult } from "./searchProviders/imageTypes.js";

// Single-item "quick search" tool: broader/looser than the catalog pipeline
// (no style code to anchor on), so it leans on pooling many candidates
// across query variations and filtering/ranking by resolution + colour
// match instead of page-evidence verification.

export const MIN_SHORT_SIDE_PX = 800;
const CANDIDATE_POOL_TARGET = 40; // "fetch 30-50, then narrow down"
const MAX_RESULTS = 10;
const DIMENSION_PROBE_LIMIT = 40;
const PROBE_CONCURRENCY = 6;

const STOCK_PREVIEW_DOMAINS = [
  "istockphoto.com",
  "shutterstock.com",
  "gettyimages.com",
  "alamy.com",
  "123rf.com",
  "dreamstime.com",
  "depositphotos.com",
  "stock.adobe.com",
  "canstockphoto.com",
  "bigstockphoto.com",
  "vectorstock.com",
  "pond5.com",
];

export interface ImageCandidate {
  imageUrl: string;
  sourceUrl: string;
  title: string;
  domain: string;
  width?: number;
  height?: number;
  colourDistance?: number;
}

export interface QuickSearchParams {
  query: string;
  colourName?: string;
  colourHex?: string;
}

export function isLikelyStockOrWatermarked(imageUrl: string, domain: string): boolean {
  const d = domain.toLowerCase();
  if (STOCK_PREVIEW_DOMAINS.some((s) => d === s || d.endsWith(`.${s}`))) return true;
  if (/watermark/i.test(imageUrl)) return true;
  return false;
}

function toCandidate(img: RawImageResult): ImageCandidate {
  return {
    imageUrl: img.imageUrl,
    sourceUrl: img.sourceUrl,
    title: img.title,
    domain: img.domain,
    width: img.width,
    height: img.height,
  };
}

export async function quickImageSearch(params: QuickSearchParams): Promise<ImageCandidate[]> {
  const query = params.query.trim();
  if (!query) throw new Error("Query is required.");

  if (!isSearchConfigured()) {
    throw new ProviderNotConfiguredError(env.SEARCH_PROVIDER);
  }

  const provider = getActiveProvider();
  const queries = buildQuickSearchQueries({ query, colourName: params.colourName });
  const pool = new Map<string, ImageCandidate>();

  const addAll = (imgs: RawImageResult[]) => {
    for (const img of imgs) {
      if (!img.imageUrl || pool.has(img.imageUrl)) continue;
      pool.set(img.imageUrl, toCandidate(img));
    }
  };

  for (const q of queries) {
    if (pool.size >= CANDIDATE_POOL_TARGET) break;

    // Dedicated image-search endpoints (when available) return real
    // width/height directly, avoiding a network probe per candidate.
    try {
      if (provider?.name === "google_cse") {
        addAll(await googleSearchImages(q));
      } else if (provider?.name === "bing") {
        addAll(await bingSearchImages(q));
      }
    } catch {
      // Image-search endpoint is a bonus path; fall through to text search.
    }

    if (pool.size >= CANDIDATE_POOL_TARGET) break;

    const { results } = await runSearch(q);
    for (const r of results) {
      if (!r.imageUrl || pool.has(r.imageUrl)) continue;
      pool.set(r.imageUrl, {
        imageUrl: r.imageUrl,
        sourceUrl: r.url,
        title: r.title,
        domain: r.domain || domainOf(r.url),
      });
    }
  }

  let candidates = Array.from(pool.values()).filter(
    (c) => !isLikelyStockOrWatermarked(c.imageUrl, c.domain)
  );

  candidates = await probeMissingDimensions(candidates);

  candidates = candidates.filter(
    (c) => c.width !== undefined && c.height !== undefined && Math.min(c.width, c.height) >= MIN_SHORT_SIDE_PX
  );

  const targetRgb = params.colourHex ? hexToRgb(params.colourHex) : null;
  if (targetRgb) {
    candidates = await attachColourDistance(candidates, targetRgb);
  }

  candidates.sort((a, b) => rankScore(b, Boolean(targetRgb)) - rankScore(a, Boolean(targetRgb)));

  return candidates.slice(0, MAX_RESULTS);
}

async function probeMissingDimensions(candidates: ImageCandidate[]): Promise<ImageCandidate[]> {
  const needsProbe = candidates.filter((c) => c.width === undefined || c.height === undefined);
  const toProbe = needsProbe.slice(0, DIMENSION_PROBE_LIMIT);
  const limit = pLimit(PROBE_CONCURRENCY);

  await Promise.all(
    toProbe.map((c) =>
      limit(async () => {
        const dims = await probeImageDimensions(c.imageUrl);
        if (dims) {
          c.width = dims.width;
          c.height = dims.height;
        }
      })
    )
  );

  // Anything left unprobed (pool exceeded the probe budget) or that failed
  // to resolve to a real image is dropped by the resolution filter below
  // (width/height stay undefined).
  return candidates;
}

/** Pure/network-free: decode dimensions from already-fetched bytes. Split out
 *  from probeImageDimensions so the decoding logic can be unit-tested with an
 *  in-memory sharp-generated image, the same way imageStorage.ts does. */
export async function dimensionsFromBuffer(buffer: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(buffer, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

async function probeImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const safe = await assertSafeExternalUrl(url);
    const res = await fetchWithTimeout(safe.toString());
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength && contentLength > env.MAX_IMAGE_MB * 1024 * 1024) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > env.MAX_IMAGE_MB * 1024 * 1024) return null;
    return dimensionsFromBuffer(buffer);
  } catch {
    return null;
  }
}

async function attachColourDistance(
  candidates: ImageCandidate[],
  target: { r: number; g: number; b: number }
): Promise<ImageCandidate[]> {
  const limit = pLimit(PROBE_CONCURRENCY);
  await Promise.all(
    candidates.map((c) =>
      limit(async () => {
        const rgb = await probeDominantColour(c.imageUrl);
        if (rgb) c.colourDistance = rgbDistance(rgb, target);
      })
    )
  );
  return candidates;
}

/** Pure/network-free: downsampling to 1x1 with averaging interpolation gives
 *  a cheap approximation of the image's dominant/average colour. */
export async function dominantColourFromBuffer(buffer: Buffer): Promise<{ r: number; g: number; b: number } | null> {
  try {
    const { data } = await sharp(buffer, { failOn: "none" })
      .resize(1, 1, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (data.length < 3) return null;
    return { r: data[0], g: data[1], b: data[2] };
  } catch {
    return null;
  }
}

async function probeDominantColour(url: string): Promise<{ r: number; g: number; b: number } | null> {
  try {
    const safe = await assertSafeExternalUrl(url);
    const res = await fetchWithTimeout(safe.toString());
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return dominantColourFromBuffer(buffer);
  } catch {
    return null;
  }
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function rgbDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 ** 2);

/** Resolution is the primary signal; a supplied colour hex nudges the order
 *  toward closer matches without ever zeroing out an otherwise-great photo. */
export function rankScore(c: ImageCandidate, hasColourTarget: boolean): number {
  const resScore = Math.min(c.width ?? 0, c.height ?? 0);
  if (!hasColourTarget || c.colourDistance === undefined) return resScore;
  const closeness = Math.max(0, 1 - c.colourDistance / MAX_RGB_DISTANCE);
  return resScore * (0.5 + 0.5 * closeness);
}
