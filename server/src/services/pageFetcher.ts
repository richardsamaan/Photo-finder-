import * as cheerio from "cheerio";
import { fetchWithTimeout, domainOf } from "../lib/httpFetch.js";
import { isAllowedByRobots } from "./robotsCheck.js";
import { getProviderForContentFetch } from "./searchProviders/index.js";

export interface PageContent {
  url: string;
  domain: string;
  text: string;
  images: { url: string; alt: string }[];
  blockedByRobots?: boolean;
}

/**
 * Fetch a product page for verification. Prefers the active search provider's
 * own scrape capability (e.g. Firecrawl) when available; otherwise does a
 * direct HTTP GET + cheerio extraction. Always checks robots.txt first and
 * refuses to fetch disallowed paths - we do not bypass site policy.
 */
export async function fetchProductPage(url: string): Promise<PageContent | null> {
  const allowed = await isAllowedByRobots(url);
  if (!allowed) {
    return { url, domain: domainOf(url), text: "", images: [], blockedByRobots: true };
  }

  const provider = getProviderForContentFetch();
  if (provider?.fetchPageContent) {
    try {
      const scraped = await provider.fetchPageContent(url);
      if (scraped) {
        return {
          url,
          domain: domainOf(url),
          text: scraped.text,
          images: scraped.images.map((i) => ({ url: i, alt: "" })),
        };
      }
    } catch {
      // fall through to direct fetch
    }
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
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage) images.push({ url: new URL(ogImage, url).href, alt: "og:image" });

    $("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (!src) return;
      try {
        images.push({ url: new URL(src, url).href, alt: $(el).attr("alt") ?? "" });
      } catch {
        /* ignore malformed src */
      }
    });

    return { url, domain: domainOf(url), text, images: dedupeImages(images) };
  } catch {
    return null;
  }
}

function dedupeImages(images: { url: string; alt: string }[]) {
  const seen = new Set<string>();
  return images.filter((img) => {
    if (seen.has(img.url)) return false;
    seen.add(img.url);
    return true;
  });
}
