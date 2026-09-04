#!/usr/bin/env node
/**
 * Fully standalone, dependency-light smoke test for the 5 direct-site-search
 * adapters (hugoboss.com, farfetch.com, mrporter.com, selfridges.com,
 * endclothing.com).
 *
 * WHY THIS FILE EXISTS AS A SEPARATE THING FROM ../smokeTestSites.ts:
 * that script imports the real server app's TypeScript source, which means
 * running it requires the FULL server workspace to be installed - including
 * better-sqlite3 and sharp, both of which ship native/compiled addons and
 * need a C++ toolchain (+ Python, for node-gyp) to build from source when no
 * prebuilt binary matches your platform. On some Windows machines without
 * those build tools installed, `npm install` for the whole server workspace
 * fails outright - even though none of that compiled code is actually
 * needed to search 5 retailer websites and pull a photo.
 *
 * This file reimplements just the search + extraction logic (copied from,
 * and kept in sync with, createSiteAdapter.ts / extractProductCandidates.ts /
 * botCheck.ts / pageFetcher.ts / queryBuilder.ts / politeness.ts /
 * robotsCheck.ts / httpFetch.ts) directly, with:
 *   - NO import of anything under server/src (no database, no Express, no
 *     PDF/ZIP generation, no confidence-scoring engine - just search+fetch).
 *   - Exactly ONE npm dependency: cheerio (pure JavaScript HTML parsing -
 *     no native/compiled code, nothing to build).
 *   - Node's own built-in `fetch`/`AbortController` (Node 18+) - no
 *     node-fetch or similar needed.
 *
 * SETUP (run once):
 *   cd server/scripts/standalone-site-test
 *   npm install
 *
 * RUN:
 *   node standalone-site-test.js <styleCode> [colourName] [category]
 *
 * EXAMPLE:
 *   node standalone-site-test.js 50464300 "OPEN BLUE" OUTERWEAR
 *
 * This makes real HTTP requests to real retailer sites - don't loop it.
 */
import * as cheerio from "cheerio";

// --- Config: the 5 target sites (kept in sync with sites/configs.ts) ---

const SITE_CONFIGS = [
  {
    domain: "hugoboss.com",
    buildSearchUrl: (q) => `https://www.hugoboss.com/us/search/?q=${encodeURIComponent(q)}`,
  },
  {
    domain: "farfetch.com",
    buildSearchUrl: (q) => `https://www.farfetch.com/shopping/search/?q=${encodeURIComponent(q)}`,
  },
  {
    domain: "mrporter.com",
    buildSearchUrl: (q) => `https://www.mrporter.com/en-us/search/?keywords=${encodeURIComponent(q)}`,
  },
  {
    domain: "selfridges.com",
    buildSearchUrl: (q) => `https://www.selfridges.com/US/en/search/?q=${encodeURIComponent(q)}`,
  },
  {
    domain: "endclothing.com",
    buildSearchUrl: (q) => `https://www.endclothing.com/us/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  },
];

const SITE_SEARCH_DELAY_MS = Number(process.env.SITE_SEARCH_DELAY_MS || 1500);
const SITE_SEARCH_MAX_RETRIES = Number(process.env.SITE_SEARCH_MAX_RETRIES || 1);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 12000);
const USER_AGENT = "ProductImageFinderBot/1.0 (+catalog-generation; contact: configure-in-env)";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- HTTP (mirrors lib/httpFetch.ts) ---

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT } });
  } finally {
    clearTimeout(timer);
  }
}

// --- Politeness (mirrors searchProviders/politeness.ts) ---

const lastRequestAt = new Map();
async function politeDelay(domain) {
  const now = Date.now();
  const last = lastRequestAt.get(domain) ?? 0;
  const wait = last + SITE_SEARCH_DELAY_MS - now;
  lastRequestAt.set(domain, Math.max(now, last + SITE_SEARCH_DELAY_MS));
  if (wait > 0) await sleep(wait);
}

// --- Query escalation (mirrors queryBuilder.ts's buildEscalatingQueries) ---

function buildEscalatingQueries(styleCode, colour, category) {
  const code = styleCode.trim();
  const col = colour.trim();
  const cat = category.trim();
  const attempts = [code, [code, col].filter(Boolean).join(" ")];
  if (cat) attempts.push([code, col, cat].filter(Boolean).join(" "));
  return Array.from(new Set(attempts.map((q) => q.replace(/\s+/g, " ").trim()))).filter(Boolean);
}

// --- Bot-check detection (mirrors searchProviders/botCheck.ts) ---

const BLOCK_STATUS_CODES = new Set([403, 429, 503]);
const BLOCK_MARKERS = [
  "access denied",
  "are you a human",
  "are you a robot",
  "pardon our interruption",
  "captcha",
  "unusual traffic",
  "request unsuccessful",
  "attention required! | cloudflare",
  "sorry, you have been blocked",
  "checking your browser",
];
function looksLikeBotBlock(status, html) {
  if (BLOCK_STATUS_CODES.has(status)) return true;
  const lower = html.slice(0, 4000).toLowerCase();
  return BLOCK_MARKERS.some((marker) => lower.includes(marker));
}

// --- robots.txt (mirrors robotsCheck.ts, simplified: no cross-run caching) ---

const robotsCache = new Map();
function parseRobots(text) {
  const lines = text.split(/\r?\n/);
  let applies = false;
  const disallow = [];
  const allow = [];
  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") applies = value === "*" || value.toLowerCase().includes("productimagefinderbot");
    else if (applies && key === "disallow" && value) disallow.push(value);
    else if (applies && key === "allow" && value) allow.push(value);
  }
  return { disallow, allow };
}
async function loadRobots(origin) {
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, 5000);
    if (!res.ok) return { disallow: [], allow: [] };
    return parseRobots(await res.text());
  } catch {
    return { disallow: [], allow: [] };
  }
}
async function isAllowedByRobots(targetUrl) {
  try {
    const u = new URL(targetUrl);
    if (!robotsCache.has(u.origin)) robotsCache.set(u.origin, loadRobots(u.origin));
    const rules = await robotsCache.get(u.origin);
    const path = u.pathname + u.search;
    const matchingDisallow = rules.disallow.filter((p) => path.startsWith(p)).sort((a, b) => b.length - a.length)[0];
    const matchingAllow = rules.allow.filter((p) => path.startsWith(p)).sort((a, b) => b.length - a.length)[0];
    if (!matchingDisallow) return true;
    if (matchingAllow && matchingAllow.length >= matchingDisallow.length) return true;
    return false;
  } catch {
    return true;
  }
}

// --- Search-results-page link extraction (mirrors extractProductCandidates.ts) ---

const NON_PRODUCT_PATH_HINTS = [
  "/search", "/account", "/login", "/signin", "/register", "/cart", "/checkout", "/basket",
  "/wishlist", "/help", "/customer-service", "/customer-care", "/stores", "/store-locator",
  "/about", "/careers", "/gift-card", "/legal", "/privacy", "/terms", "/newsletter", "/blog",
  "/sitemap", "/faq",
];
function looksLikeProductPath(path) {
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  return /\d/.test(path) || /-p-|\/p\/|\/product\/|\/dp\/|\.html$/.test(path);
}
function sameSite(hostname, domain) {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  const d = domain.toLowerCase().replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`);
}
function extractProductCandidates(html, searchPageUrl, domain, maxCandidates = 5) {
  const $ = cheerio.load(html);
  const base = new URL(searchPageUrl);
  const seen = new Set();
  const out = [];

  $("a[href]").each((_, el) => {
    if (out.length >= maxCandidates) return;
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;

    let abs;
    try {
      abs = new URL(href, base);
    } catch {
      return;
    }
    if (!sameSite(abs.hostname, domain)) return;

    const path = abs.pathname.toLowerCase();
    if (NON_PRODUCT_PATH_HINTS.some((hint) => path.includes(hint))) return;
    if (!looksLikeProductPath(path)) return;

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

// --- Product-page image extraction (mirrors pageFetcher.ts's priority chain) ---

const GALLERY_SELECTORS = [
  '[class*="product-image"] img',
  '[class*="product-gallery"] img',
  '[class*="pdp-image"] img',
  '[data-testid*="gallery"] img',
  '[data-testid*="product-image"] img',
  "picture img",
  "main img",
  "#product img",
];
function extractJsonLdProductImages(html) {
  const $ = cheerio.load(html);
  const found = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let json;
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
      } else if (img?.url) found.push(img.url);
    }
  });
  return found;
}
function extractProductImage(html, pageUrl) {
  const $ = cheerio.load(html);
  const images = [];
  const addImage = (raw, alt) => {
    if (!raw) return;
    try {
      images.push({ url: new URL(raw, pageUrl).href, alt });
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
  $("img").each((_, el) => addImage($(el).attr("src") || $(el).attr("data-src"), $(el).attr("alt") ?? ""));

  return images[0] ?? null;
}

// --- Per-site search, with retry (mirrors createSiteAdapter.ts) ---

async function searchSite(config, query) {
  const searchUrl = config.buildSearchUrl(query);
  let lastError;
  for (let attempt = 0; attempt <= SITE_SEARCH_MAX_RETRIES; attempt++) {
    try {
      await politeDelay(config.domain);
      const res = await fetchWithTimeout(searchUrl);
      const html = await res.text();
      if (!res.ok || looksLikeBotBlock(res.status, html)) {
        throw new Error(`Blocked or non-OK response from ${config.domain} (status ${res.status})`);
      }
      return extractProductCandidates(html, searchUrl, config.domain);
    } catch (err) {
      lastError = err;
      if (attempt < SITE_SEARCH_MAX_RETRIES) await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// --- Main ---

async function main() {
  const [styleCode, colour = "", category = ""] = process.argv.slice(2);
  if (!styleCode) {
    console.error('Usage: node standalone-site-test.js <styleCode> [colourName] [category]');
    console.error('Example: node standalone-site-test.js 50464300 "OPEN BLUE" OUTERWEAR');
    process.exit(1);
  }

  console.log(`Standalone site test for: styleCode=${styleCode} colour=${colour} category=${category}`);
  console.log(`Sites (${SITE_CONFIGS.length}): ${SITE_CONFIGS.map((c) => c.domain).join(", ")}`);
  console.log("This makes REAL requests to real retailer sites. Be polite - don't loop this.\n");

  const queries = buildEscalatingQueries(styleCode, colour, category);
  console.log(`Escalating query attempts that would be tried: ${JSON.stringify(queries)}`);
  console.log("(This script tries only attempt 1, Style Code alone, against each site - it's a search/extraction");
  console.log(" smoke test, not the full confidence-scoring pipeline the actual app runs.)\n");
  const query = queries[0];

  for (const config of SITE_CONFIGS) {
    console.log(`--- ${config.domain} ---`);

    let candidates;
    try {
      candidates = await searchSite(config, query);
    } catch (err) {
      console.log(`  FAILED: ${err.message}`);
      console.log("");
      continue;
    }

    if (candidates.length === 0) {
      console.log("  No candidates found (could be a genuine no-match or a URL-pattern/selector that needs updating).");
      console.log("");
      continue;
    }

    console.log(`  ${candidates.length} candidate(s):`);
    for (const c of candidates.slice(0, 3)) {
      console.log(`    - ${c.url}  (title: "${c.title}")`);
    }

    const first = candidates[0];
    const allowed = await isAllowedByRobots(first.url);
    if (!allowed) {
      console.log("  First candidate page is disallowed by robots.txt - skipped, as it should be.");
      console.log("");
      continue;
    }

    try {
      await politeDelay(config.domain);
      const res = await fetchWithTimeout(first.url);
      if (!res.ok) {
        console.log(`  Could not fetch the first candidate's product page (status ${res.status}).`);
      } else {
        const html = await res.text();
        const image = extractProductImage(html, first.url);
        if (!image) {
          console.log("  Fetched the product page but found no image - the gallery-selector fallback may need attention for this site.");
        } else {
          console.log(`  Product image resolved: ${image.url} (via ${image.alt || "generic <img> sweep"})`);
        }
      }
    } catch (err) {
      console.log(`  Could not fetch the first candidate's product page: ${err.message}`);
    }
    console.log("");
  }

  console.log("Done. Compare the above against what you see visiting these sites' search pages yourself in a browser.");
}

main().catch((err) => {
  console.error("Standalone site test failed:", err);
  process.exit(1);
});
