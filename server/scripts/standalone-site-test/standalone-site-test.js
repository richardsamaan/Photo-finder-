#!/usr/bin/env node
/**
 * Fully standalone smoke test for the 5 direct-site-search adapters
 * (hugoboss.com, farfetch.com, mrporter.com, selfridges.com,
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
 * and kept in sync with, createSiteAdapter.ts / createBrowserSiteAdapter.ts /
 * extractProductCandidates.ts / botCheck.ts / pageFetcher.ts /
 * queryBuilder.ts / politeness.ts / robotsCheck.ts / httpFetch.ts) directly,
 * with NO import of anything under server/src (no database, no Express, no
 * PDF/ZIP generation, no confidence-scoring engine - just search+fetch).
 *
 * DEPENDENCIES - still no C++ toolchain needed (unlike better-sqlite3/sharp
 * above), but NOT as lightweight as it used to be:
 *   - cheerio (pure JavaScript HTML parsing) for mrporter.com/selfridges.com/
 *     endclothing.com, which still go through a plain HTTP fetch.
 *   - playwright, for hugoboss.com and farfetch.com: live testing found that
 *     a plain fetch of their search pages does not return real, accurate
 *     results - hugoboss.com matched the wrong product (a fuzzy text-relevance
 *     match, not the exact style code) and farfetch.com returned the same
 *     generic navigation links regardless of query, most likely because
 *     their real results only render via client-side JS that a plain fetch
 *     never executes. Playwright drives a real (headless, i.e. invisible)
 *     Chromium browser instead - still free, no API key/account/subscription,
 *     but meaningfully heavier: a one-time ~300MB browser download, and each
 *     search now takes noticeably longer (a real page has to load and run
 *     its own JS) than a plain HTTP request.
 *   - Node's own built-in `fetch`/`AbortController` (Node 18+) for the
 *     plain-fetch sites - no node-fetch or similar needed.
 *
 * SETUP (run once):
 *   cd server/scripts/standalone-site-test
 *   npm install
 *   npx playwright install chromium   # one-time, ~300MB download - needed
 *                                      # for hugoboss.com/farfetch.com
 *
 * RUN:
 *   node standalone-site-test.js <styleCode> [colourName] [colourCode]
 *
 * Optional env vars:
 *   SITES=hugoboss.com,farfetch.com   restrict to just these domains
 *   BROWSER_NAV_TIMEOUT_MS=20000      per-page-load timeout for the 2
 *                                      browser-driven sites (default 20000)
 *
 * EXAMPLE (all 5 sites):
 *   node standalone-site-test.js 50464300 "OPEN BLUE" 042
 * EXAMPLE (just two confirmed-reachable sites - now noticeably slower than
 * before, since both go through a real browser page load):
 *   SITES=hugoboss.com,farfetch.com node standalone-site-test.js 50469055 Black 009
 *
 * This makes real HTTP/browser requests to real retailer sites - don't loop it.
 */
import * as cheerio from "cheerio";
import { chromium } from "playwright";

// --- Config: the 5 target sites (kept in sync with sites/configs.ts) ---
//
// Live-run findings so far (see sites/configs.ts for the full writeup):
// hugoboss.com's and farfetch.com's search URLs are both live-confirmed
// reachable (200), but a plain fetch of either returned the wrong/generic
// results - hugoboss.com fuzzy-matched an unrelated product, farfetch.com
// returned the same nav links regardless of query - most likely because
// real results on both only render via client-side JS a plain fetch never
// executes. `useBrowser: true` routes those two through a real headless
// Chromium (searchSiteWithBrowser, below) instead of plain fetch.
// mrporter.com/endclothing.com 404 on their original guessed paths (not
// blocked, just wrong path - alternates below, still unverified);
// selfridges.com still 403s even with realistic browser headers, consistent
// with heavier bot protection (see the README).
const SITE_CONFIGS = [
  {
    domain: "hugoboss.com",
    buildSearchUrl: (q) => `https://www.hugoboss.com/us/search/?q=${encodeURIComponent(q)}`,
    // Require a real product id (6+ digit run) before the .html, so a
    // category/listing page can't pass as a product page.
    productUrlPattern: /\d{6,}[^/]*\.html$/i,
    useBrowser: true,
  },
  {
    domain: "farfetch.com",
    buildSearchUrl: (q) => `https://www.farfetch.com/search?q=${encodeURIComponent(q)}`,
    // Farfetch's real product pages are conventionally named
    // "<slug>-item-<digits>.aspx" while category/listing pages are
    // "items.aspx" (plural, no id) - this also doubles as the "did the
    // browser land directly on a single matching product page" check in
    // searchSiteWithBrowser (a live run showed Farfetch can redirect
    // straight to the one matching product instead of a listing page).
    productUrlPattern: /-item-\d+\.aspx(?:[/?#]|$)/i,
    useBrowser: true,
  },
  {
    domain: "mrporter.com",
    buildSearchUrl: (q) => `https://www.mrporter.com/en-us/search?keyword=${encodeURIComponent(q)}`,
  },
  {
    domain: "selfridges.com",
    buildSearchUrl: (q) => `https://www.selfridges.com/US/en/search/?q=${encodeURIComponent(q)}`,
  },
  {
    domain: "endclothing.com",
    buildSearchUrl: (q) => `https://www.endclothing.com/search?q=${encodeURIComponent(q)}`,
  },
];

const SITE_SEARCH_DELAY_MS = Number(process.env.SITE_SEARCH_DELAY_MS || 1500);
const SITE_SEARCH_MAX_RETRIES = Number(process.env.SITE_SEARCH_MAX_RETRIES || 1);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 12000);
const BROWSER_NAV_TIMEOUT_MS = Number(process.env.BROWSER_NAV_TIMEOUT_MS || 20000);

// --- User-Agent policy: an explicit, visible choice, not a silent one ---
//
// The rest of this app (server/src/lib/httpFetch.ts) deliberately sends an
// honest, self-identifying bot User-Agent - see the README's "known
// limitations" section: this project does not spoof a browser to evade
// detection. This standalone diagnostic script is different on purpose:
// it exists specifically to answer "is a missing browser-shaped fingerprint
// what's causing the block", so BROWSER_UA=1 (the default here) sends a
// full, realistic Chrome header set. Set BROWSER_UA=0 to instead send the
// same honest bot identity as the rest of the app, for comparison.
const USE_BROWSER_HEADERS = process.env.BROWSER_UA !== "0";
const HONEST_UA = "ProductImageFinderBot/1.0 (+catalog-generation; contact: configure-in-env)";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * A realistic set of headers a real Chrome browser sends automatically on
 * a normal page navigation - not just the User-Agent. `referer` should be
 * the URL a real user would have just been on (omit for the first request
 * to a site; pass the search-results URL when following a link from it).
 */
function buildBrowserHeaders({ referer } = {}) {
  if (!USE_BROWSER_HEADERS) return { "User-Agent": HONEST_UA };
  return {
    "User-Agent": CHROME_UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": referer ? "same-origin" : "none",
    "Sec-Fetch-User": "?1",
    "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    Priority: "u=0, i",
    ...(referer ? { Referer: referer } : {}),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- HTTP (mirrors lib/httpFetch.ts, extended with realistic browser headers) ---

async function fetchWithTimeout(url, { timeoutMs = FETCH_TIMEOUT_MS, referer } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: buildBrowserHeaders({ referer }) });
  } finally {
    clearTimeout(timer);
  }
}

// --- Headless browser (mirrors createBrowserSiteAdapter.ts) ---
//
// One shared Chromium instance, launched lazily on first use and reused for
// every subsequent browser-driven search (launching fresh per query would
// add real, unnecessary latency). Each search still gets its own isolated
// browser *context*, so one query's cookies/session state never leak into
// another's.
let browserInstance = null;
async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
      // Optional override for a specific Chromium binary instead of
      // Playwright's own downloaded/managed browser - e.g. a Docker image
      // with a system Chromium already installed. Leave unset for normal use.
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    });
  }
  return browserInstance;
}
async function closeBrowserIfOpen() {
  if (!browserInstance) return;
  const browser = browserInstance;
  browserInstance = null;
  await browser.close();
}
// Real browser headers are Playwright's own default (a genuine Chromium
// fingerprint, more authentic than any hand-built header set) unless
// BROWSER_UA=0 asks for a direct comparison against this app's normal
// honest bot identity instead - see the User-Agent policy write-up above.
function browserContextOptions() {
  return USE_BROWSER_HEADERS ? {} : { userAgent: HONEST_UA };
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

function buildEscalatingQueries(styleCode, colour, colourCode) {
  const code = styleCode.trim();
  const col = colour.trim();
  const colCode = colourCode.trim();
  const attempts = [code, [code, col].filter(Boolean).join(" ")];
  // Attempt 3 is Style Code + Colour Code on its own - not combined with
  // Colour Name - a fresh, narrower attempt in its own right.
  if (colCode) attempts.push([code, colCode].filter(Boolean).join(" "));
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
    const res = await fetchWithTimeout(`${origin}/robots.txt`, { timeoutMs: 5000 });
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
// Requires a run of 4+ consecutive digits, not just "any digit anywhere" - a
// bug found on a live run (2026): farfetch.com's global top-nav category
// links (short 1-2 digit category ids) were misclassified as product
// candidates by the old "any digit" check, so every query returned the same
// 3 generic nav links regardless of what was actually searched.
function looksLikeProductPath(path) {
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  return /\d{4,}/.test(path) || /-p-|\/p\/|\/product\/|\/dp\/|\.html$/.test(path);
}
// "Is this URL path a product page" - exposed standalone (not just inlined
// in extractProductCandidates below) so searchSiteWithBrowser can apply it
// to the *whole page* the browser ended up on, not just individual links -
// see its own comment for why (a live farfetch.com run redirected straight
// to a single matching product page instead of a listing page).
function isProductPath(pathname, config) {
  return config.productUrlPattern ? config.productUrlPattern.test(pathname) : looksLikeProductPath(pathname.toLowerCase());
}
function sameSite(hostname, domain) {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  const d = domain.toLowerCase().replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`);
}
function extractProductCandidates(html, searchPageUrl, config, maxCandidates = 5) {
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
      // Distinguish "blocked" (bot-check/rate-limit) from "wrong URL"
      // (404 - the site responded normally, our path is just wrong) from
      // any other non-OK status - these need very different fixes, so
      // lumping them into one message hides that.
      if (looksLikeBotBlock(res.status, html)) {
        throw new Error(`BLOCKED by ${config.domain} (status ${res.status}) - bot-check/rate-limit, not a URL problem`);
      }
      if (res.status === 404) {
        throw new Error(`404 from ${config.domain} - the search URL pattern is likely wrong, not blocked`);
      }
      if (!res.ok) {
        throw new Error(`Non-OK response from ${config.domain} (status ${res.status})`);
      }
      return extractProductCandidates(html, searchUrl, config);
    } catch (err) {
      lastError = err;
      if (attempt < SITE_SEARCH_MAX_RETRIES) await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// --- Per-site search via a real headless browser (mirrors createBrowserSiteAdapter.ts) ---
//
// For hugoboss.com/farfetch.com only (see SITE_CONFIGS' useBrowser flag) -
// a plain fetch's raw, pre-JS HTML doesn't reliably hold their real search
// results (see the top-of-file writeup). This drives a real Chromium
// instead: navigate, wait for the page's own JS/network activity to
// actually settle, then read whatever rendered - reusing the exact same
// bot-check/404/candidate-extraction logic as searchSite() above, so both
// paths stay behaviorally consistent; only "how do we get the HTML" differs.
async function searchSiteWithBrowser(config, query) {
  const searchUrl = config.buildSearchUrl(query);
  let lastError;
  for (let attempt = 0; attempt <= SITE_SEARCH_MAX_RETRIES; attempt++) {
    await politeDelay(config.domain);
    const browser = await getBrowser();
    const context = await browser.newContext(browserContextOptions());
    try {
      const page = await context.newPage();
      const response = await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: BROWSER_NAV_TIMEOUT_MS,
      });
      // The initial HTML committed above is exactly what a plain fetch
      // would have seen - the real product grid (or a client-side redirect
      // to a single matching product) still has to run its own JS after
      // that. "networkidle" (no in-flight requests for 500ms) is a generic
      // proxy for "probably done rendering," with no site-specific
      // knowledge required. Some sites never truly go idle (polling/
      // analytics beacons) - proceed with whatever rendered so far rather
      // than failing the whole search over that.
      await page.waitForLoadState("networkidle", { timeout: BROWSER_NAV_TIMEOUT_MS }).catch(() => {});

      const status = response ? response.status() : 0;
      const html = await page.content();

      if (looksLikeBotBlock(status, html)) {
        throw new Error(`BLOCKED by ${config.domain} (status ${status}) - bot-check/rate-limit, not a URL problem`);
      }
      if (status === 404) {
        throw new Error(`404 from ${config.domain} - the search URL pattern is likely wrong, not blocked`);
      }
      if (status !== 0 && (status < 200 || status >= 400)) {
        throw new Error(`Non-OK response from ${config.domain} (status ${status})`);
      }

      const finalUrl = page.url();
      const finalPath = new URL(finalUrl).pathname;

      // A live run on farfetch.com showed both outcomes: a normal
      // results-listing page, or the browser being redirected straight to
      // the one matching product page when the query has a unique hit. If
      // we ended up somewhere other than the search URL we asked for, and
      // that page itself already looks like a product page, treat it as
      // the single candidate instead of scanning it for more links.
      if (finalUrl !== searchUrl && isProductPath(finalPath, config)) {
        const title = (await page.title().catch(() => "")) || "";
        return [{ url: finalUrl, title }];
      }

      return extractProductCandidates(html, finalUrl, config);
    } catch (err) {
      lastError = err;
      if (attempt < SITE_SEARCH_MAX_RETRIES) await sleep(500 * 2 ** attempt);
    } finally {
      await context.close();
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// Same idea as the plain-fetch product-page step in main(), but for a
// candidate that came from a browser-driven site - if the search needed a
// real browser to render, the product page might too, so this reuses the
// same shared Chromium instance rather than falling back to a plain fetch.
async function fetchProductPageWithBrowser(productUrl, refererUrl) {
  const browser = await getBrowser();
  const context = await browser.newContext(browserContextOptions());
  try {
    const page = await context.newPage();
    const response = await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: BROWSER_NAV_TIMEOUT_MS,
      referer: refererUrl,
    });
    await page.waitForLoadState("networkidle", { timeout: BROWSER_NAV_TIMEOUT_MS }).catch(() => {});
    if (!response || !response.ok()) {
      return { ok: false, status: response ? response.status() : 0 };
    }
    const html = await page.content();
    return { ok: true, html, url: page.url() };
  } finally {
    await context.close();
  }
}

// --- Raw search-page diagnostic (bypasses extraction entirely) ---
//
// Added after a live run (2026) where farfetch.com returned the exact same
// 3 generic nav links for every query - which could equally have been "the
// search URL redirected somewhere else" or "the real results are rendered
// client-side and never appear in the raw HTML at all" (which no plain HTTP
// fetch, however well-patterned, could ever see). This prints enough to
// tell those apart at a glance, before even looking at extracted candidates.
async function diagnoseSearchPage(domain, url) {
  try {
    const res = await fetchWithTimeout(url);
    const html = await res.text();
    if (res.url !== url) {
      console.log(`    [diagnostic] Site redirected the search URL to: ${res.url}`);
    }
    const $ = cheerio.load(html);
    const hrefs = $("a[href]").toArray().map((el) => $(el).attr("href") ?? "");
    const sameDomainCount = hrefs.filter((h) => {
      try {
        return sameSite(new URL(h, url).hostname, domain);
      } catch {
        return false;
      }
    }).length;
    console.log(
      `    [diagnostic] status=${res.status}, ${hrefs.length} total <a href> on the raw page (${sameDomainCount} same-domain).` +
        (hrefs.length < 5
          ? " Very few links at all - this page may be a JS shell whose real content never appears in the raw HTML."
          : "")
    );
  } catch (err) {
    console.log(`    [diagnostic] Could not fetch the raw search page directly: ${err.message}`);
  }
}

// --- Main ---

async function main() {
  const [styleCode, colour = "", colourCode = ""] = process.argv.slice(2);
  if (!styleCode) {
    console.error('Usage: node standalone-site-test.js <styleCode> [colourName] [colourCode]');
    console.error('Example: node standalone-site-test.js 50469055 Black 009');
    process.exit(1);
  }

  const onlySites = process.env.SITES?.split(",").map((s) => s.trim()).filter(Boolean);
  const sites = onlySites ? SITE_CONFIGS.filter((c) => onlySites.includes(c.domain)) : SITE_CONFIGS;
  if (sites.length === 0) {
    console.error(`No matching site configs for SITES=${process.env.SITES}. Available: ${SITE_CONFIGS.map((c) => c.domain).join(", ")}`);
    process.exit(1);
  }

  console.log(`Standalone site test for: styleCode=${styleCode} colour=${colour} colourCode=${colourCode}`);
  console.log(`Sites (${sites.length}): ${sites.map((c) => c.domain).join(", ")}`);
  console.log(
    USE_BROWSER_HEADERS
      ? "Header mode: realistic Chrome browser headers (User-Agent, Accept, Accept-Language, Sec-Fetch-*, Referer, etc.) - set BROWSER_UA=0 to compare against this app's normal honest bot identity instead."
      : "Header mode: honest bot identity (ProductImageFinderBot/1.0), same as the rest of this app - set BROWSER_UA=1 (the default) to compare against realistic browser headers instead."
  );
  console.log("This makes REAL requests to real retailer sites. Be polite - don't loop this.\n");

  const queries = buildEscalatingQueries(styleCode, colour, colourCode);
  const ATTEMPT_LABELS = ["Style Code alone", "+ Colour Name", "+ Colour Code"];
  console.log(`Escalating query attempts: ${JSON.stringify(queries)}`);
  console.log(
    "Runs ALL of these per site (not just attempt 1) - a bare style-code query can match the wrong"
  );
  console.log(
    "department on a site with fuzzy text search; comparing attempts side by side shows whether +Colour"
  );
  console.log(
    "Name/+Colour Code actually narrows it down. This is still just search/extraction, not the full"
  );
  console.log("confidence-scoring pipeline the actual app runs - eyeball the results yourself.\n");

  for (const config of sites) {
    console.log(`=== ${config.domain} ===`);
    if (config.useBrowser) {
      console.log("  (goes through a real headless browser - noticeably slower than a plain fetch, that's expected)");
    }

    await diagnoseSearchPage(config.domain, config.buildSearchUrl(queries[0]));

    for (const [i, query] of queries.entries()) {
      console.log(`  [Attempt ${i + 1}: ${ATTEMPT_LABELS[i]}] query="${query}"`);

      let candidates;
      try {
        candidates = config.useBrowser ? await searchSiteWithBrowser(config, query) : await searchSite(config, query);
      } catch (err) {
        console.log(`    FAILED: ${err.message}`);
        continue;
      }

      if (candidates.length === 0) {
        console.log("    No candidates found (genuine no-match, or a URL-pattern/selector that needs updating).");
        continue;
      }

      console.log(`    ${candidates.length} candidate(s):`);
      for (const c of candidates.slice(0, 3)) {
        console.log(`      - ${c.url}  (title: "${c.title}")`);
      }

      const first = candidates[0];
      const allowed = await isAllowedByRobots(first.url);
      if (!allowed) {
        console.log("    First candidate page is disallowed by robots.txt - skipped, as it should be.");
        continue;
      }

      try {
        await politeDelay(config.domain);
        // Referer set to the search-results page, like a real click-through.
        if (config.useBrowser) {
          const page = await fetchProductPageWithBrowser(first.url, config.buildSearchUrl(query));
          if (!page.ok) {
            console.log(`    Could not fetch the first candidate's product page (status ${page.status}).`);
          } else {
            const image = extractProductImage(page.html, page.url);
            if (!image) {
              console.log("    Fetched the product page but found no image - the gallery-selector fallback may need attention for this site.");
            } else {
              console.log(`    Product image resolved: ${image.url} (via ${image.alt || "generic <img> sweep"})`);
            }
          }
        } else {
          const res = await fetchWithTimeout(first.url, { referer: config.buildSearchUrl(query) });
          if (!res.ok) {
            console.log(`    Could not fetch the first candidate's product page (status ${res.status}).`);
          } else {
            const html = await res.text();
            const image = extractProductImage(html, first.url);
            if (!image) {
              console.log("    Fetched the product page but found no image - the gallery-selector fallback may need attention for this site.");
            } else {
              console.log(`    Product image resolved: ${image.url} (via ${image.alt || "generic <img> sweep"})`);
            }
          }
        }
      } catch (err) {
        console.log(`    Could not fetch the first candidate's product page: ${err.message}`);
      }
    }
    console.log("");
  }

  console.log("Done. Compare the above against what you see visiting these sites' search pages yourself in a browser.");
  console.log("Remember: this script only checks 'does a plausible product page exist', not 'is it actually");
  console.log("the right style code/colour' - that check lives in the real app's verification engine");
  console.log("(services/verification.ts), which this standalone script deliberately doesn't include.");
}

main()
  .catch((err) => {
    console.error("Standalone site test failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Otherwise a launched Chromium process keeps the script alive after
    // main() resolves/rejects instead of letting node exit.
    await closeBrowserIfOpen();
  });
