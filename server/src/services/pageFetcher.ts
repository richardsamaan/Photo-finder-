import * as cheerio from "cheerio";
import { fetchWithTimeout, domainOf } from "../lib/httpFetch.js";
import { isAllowedByRobots } from "./robotsCheck.js";

export interface PageContent {
  url: string;
  domain: string;
  text: string;
  images: { url: string; alt: string }[];
  blockedByRobots?: boolean;
}

// Tried, in priority order, before the generic page-wide <img> sweep. Not
// site-specific selectors (this sandbox can't verify any individual
// retailer's live markup - see sites/configs.ts) - just common, defensive
// patterns for "the main product photo" that hold across most e-commerce
// product-detail page layouts.
const GALLERY_SELECTORS = [
  '[class*="product-image"] img',
  '[class*="product-gallery"] img',
  '[class*="pdp-image"] img',
  '[data-testid*="gallery"] img',
  '[data-testid*="product-image"] img',
  'picture img',
  'main img',
  '#product img',
];

/**
 * Fetch a product page for verification: checks robots.txt first (never
 * fetches a disallowed path), then does a direct HTTP GET + cheerio
 * extraction. The primary product image is resolved through a priority
 * chain - og:image, then schema.org JSON-LD Product.image, then a handful of
 * common gallery selectors, then any image on the page - so images[0] is
 * always the best available guess even when og:image is missing or wrong.
 */
export async function fetchProductPage(url: string): Promise<PageContent | null> {
  const allowed = await isAllowedByRobots(url);
  if (!allowed) {
    return { url, domain: domainOf(url), text: "", images: [], blockedByRobots: true };
  }

  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, noscript").remove();

    const text = [
      $("title").text(),
      $('meta[name="description"]').attr("content") ?? "",
      $('meta[property="og:title"]').attr("content") ?? "",
      $('meta[property="og:description"]').attr("content") ?? "",
      $("h1, h2, h3").text(),
      $("body").text(),
    ]
      .join(" \n ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20000);

    const images: { url: string; alt: string }[] = [];
    const addImage = (raw: string | undefined | null, alt: string) => {
      if (!raw) return;
      try {
        images.push({ url: new URL(raw, url).href, alt });
      } catch {
        /* ignore malformed src */
      }
    };

    addImage($('meta[property="og:image"]').attr("content"), "og:image");
    addImage($('meta[name="twitter:image"]').attr("content"), "twitter:image");
    extractJsonLdProductImages(html).forEach((img) => addImage(img, "ld+json:Product.image"));
    for (const selector of GALLERY_SELECTORS) {
      $(selector).each((_, el) => addImage($(el).attr("src") || $(el).attr("data-src"), selector));
    }
    $("img").each((_, el) => {
      addImage($(el).attr("src") || $(el).attr("data-src"), $(el).attr("alt") ?? "");
    });

    return { url, domain: domainOf(url), text, images: dedupeImages(images) };
  } catch {
    return null;
  }
}

/**
 * Product pages very commonly embed schema.org structured data
 * (`<script type="application/ld+json">`) for SEO, whose `Product.image`
 * field is a reliable image source independent of a page's og:image tag
 * (or lack of one). Best-effort JSON parsing - any malformed/irrelevant
 * block is skipped rather than failing the whole page fetch.
 */
function extractJsonLdProductImages(html: string): string[] {
  const $ = cheerio.load(html);
  const found: string[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    let json: any;
    try {
      json = JSON.parse($(el).contents().text());
    } catch {
      return;
    }
    const nodes = Array.isArray(json) ? json : [json, ...(Array.isArray(json?.["@graph"]) ? json["@graph"] : [])];
    for (const node of nodes) {
      if (!node) continue;
      const type = node["@type"];
      const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
      if (!isProduct) continue;

      const img = node.image;
      if (typeof img === "string") found.push(img);
      else if (Array.isArray(img)) {
        for (const i of img) {
          if (typeof i === "string") found.push(i);
          else if (i?.url) found.push(i.url);
        }
      } else if (img?.url) {
        found.push(img.url);
      }
    }
  });

  return found;
}

function dedupeImages(images: { url: string; alt: string }[]) {
  const seen = new Set<string>();
  return images.filter((img) => {
    if (seen.has(img.url)) return false;
    seen.add(img.url);
    return true;
  });
}
