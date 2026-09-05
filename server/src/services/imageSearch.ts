import sharp from "sharp";
import pLimit from "p-limit";
import { env } from "../env.js";
import { fetchWithTimeout } from "../lib/httpFetch.js";
import { assertSafeExternalUrl } from "../lib/validateUrl.js";
import { buildQuickSearchQueries } from "./queryBuilder.js";
import { runSiteSearch } from "./searchProviders/index.js";
import { fetchProductPage } from "./pageFetcher.js";

// Single-item "quick search" tool: broader/looser than the catalog pipeline
// (no style code to anchor on), so it leans on pooling many candidates
// across query variations and filtering/ranking by resolution + colour
// match instead of page-evidence verification. Runs on the same direct
// on-site search adapters as the main pipeline (searchProviders/sites/) -
// there is no separate general-web-search or dedicated image-search API
// anymore, so every candidate's image comes from actually fetching its
// product page (fetchProductPage), same as the catalog pipeline does.

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

const PAGE_FETCH_CONCURRENCY = 6;

export async function quickImageSearch(params: QuickSearchParams): Promise<ImageCandidate[]> {
  const query = params.query.trim();
  if (!query) throw new Error("Query is required.");

  const queries = buildQuickSearchQueries({ query, colourName: params.colourName });
  const seenPages = new Set<string>();
  const pageCandidates: { sourceUrl: string; title: string; domain: string }[] = [];

  for (const q of queries) {
    if (pageCandidates.length >= CANDIDATE_POOL_TARGET) break;
    const { results } = await runSiteSearch(q);
    for (const r of results) {
      if (!r.url || seenPages.has(r.url)) continue;
      seenPages.add(r.url);
      pageCandidates.push({ sourceUrl: r.url, title: r.title, domain: r.domain });
    }
  }

  // No dedicated image-search API exists anymore (no API keys, anywhere) -
  // each candidate page has to actually be fetched to find its product
  // image, the same fetchProductPage() the main catalog pipeline uses.
  const limit = pLimit(PAGE_FETCH_CONCURRENCY);
  const pool = new Map<string, ImageCandidate>();
  await Promise.all(
    pageCandidates.slice(0, CANDIDATE_POOL_TARGET).map((c) =>
      limit(async () => {
        const page = await fetchProductPage(c.sourceUrl);
        const imageUrl = page?.images?.[0]?.url;
        if (!imageUrl || pool.has(imageUrl)) return;
        pool.set(imageUrl, { imageUrl, sourceUrl: c.sourceUrl, title: c.title, domain: c.domain });
      })
    )
  );

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
