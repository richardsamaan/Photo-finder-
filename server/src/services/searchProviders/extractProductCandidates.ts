import * as cheerio from "cheerio";

export interface ProductCandidateLink {
  url: string;
  title: string;
}

// Paths that are never a product page, regardless of site - filters out nav,
// account, and content links that a search-results page inevitably also
// contains alongside real product tiles.
const NON_PRODUCT_PATH_HINTS = [
  "/search",
  "/account",
  "/login",
  "/signin",
  "/register",
  "/cart",
  "/checkout",
  "/basket",
  "/wishlist",
  "/help",
  "/customer-service",
  "/customer-care",
  "/stores",
  "/store-locator",
  "/about",
  "/careers",
  "/gift-card",
  "/legal",
  "/privacy",
  "/terms",
  "/newsletter",
  "/blog",
  "/sitemap",
  "/faq",
];

/**
 * Generic fallback for "does this path look like a product page" when a site
 * doesn't supply its own `productUrlPattern`. Product pages are rarely
 * top-level and usually carry either a real product/SKU id or a recognizable
 * product URL segment (`/p/`, `/product/`, `/dp/`) or end in `.html` (common
 * on Commerce Cloud / Magento-family retail platforms).
 *
 * Requires a run of 4+ consecutive digits, not just "any digit anywhere" -
 * a bug found on a live run (2026): farfetch.com's global top-nav category
 * links (Clothing/Shoes/Bags-style, using short 1-2 digit category ids)
 * were being misclassified as product candidates by the old "any digit"
 * check, so every query returned the exact same 3 generic nav links
 * regardless of what was actually searched. A real product/SKU id is
 * reliably longer than a category id, so this keeps accepting genuine
 * product paths (see jsonLdSearchResults fixture, an 8-digit id with no
 * other marker) while excluding short category/page-number noise.
 */
function looksLikeProductPath(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  return /\d{4,}/.test(path) || /-p-|\/p\/|\/product\/|\/dp\/|\.html$/.test(path);
}

export interface ExtractConfig {
  /** Bare domain this adapter is scoped to, e.g. "hugoboss.com" - links elsewhere on the page (ads, cross-site nav) are ignored. */
  domain: string;
  /** Optional per-site override for "is this href a product page". Falls back to looksLikeProductPath(). */
  productUrlPattern?: RegExp;
  maxCandidates?: number;
}

/**
 * "Is this URL path a product page" - the same per-site pattern (or generic
 * fallback) extractProductCandidates() uses on individual links, exposed
 * standalone so createBrowserSiteAdapter.ts can apply it to the *whole page*
 * it ended up on. A real headless browser can be redirected straight to a
 * single matching product page instead of a search-results listing (seen on
 * a live farfetch.com run) - this is how that case is told apart from an
 * ordinary listing page worth scanning for links.
 */
export function isProductPath(pathname: string, config: { productUrlPattern?: RegExp }): boolean {
  return config.productUrlPattern ? config.productUrlPattern.test(pathname) : looksLikeProductPath(pathname.toLowerCase());
}

function sameSite(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  const d = domain.toLowerCase().replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Pure HTML parsing, no network - extracts candidate product-page links from
 * a fetched on-site search-results page. Shared by every site adapter so the
 * fragile part (matching a real product tile vs. nav chrome) is written and
 * tested once instead of once per site.
 */
export function extractProductCandidates(
  html: string,
  searchPageUrl: string,
  config: ExtractConfig
): ProductCandidateLink[] {
  const $ = cheerio.load(html);
  const base = new URL(searchPageUrl);
  const seen = new Set<string>();
  const out: ProductCandidateLink[] = [];
  const max = config.maxCandidates ?? 5;

  $("a[href]").each((_, el) => {
    if (out.length >= max) return;
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;

    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      return;
    }
    if (!sameSite(abs.hostname, config.domain)) return;

    const path = abs.pathname.toLowerCase();
    if (NON_PRODUCT_PATH_HINTS.some((hint) => path.includes(hint))) return;

    if (!isProductPath(abs.pathname, config)) return;

    const key = abs.origin + abs.pathname;
    if (seen.has(key)) return;
    seen.add(key);

    const title =
      $(el).attr("aria-label")?.trim() ||
      $(el).find("img").attr("alt")?.trim() ||
      $(el).text().replace(/\s+/g, " ").trim() ||
      "";

    out.push({ url: abs.href, title });
  });

  return out;
}
