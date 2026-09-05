import { chromium, type Browser } from "playwright";
import { env } from "../../env.js";
import { looksLikeBotBlock } from "./botCheck.js";
import { extractProductCandidates, isProductPath } from "./extractProductCandidates.js";
import type { SiteAdapterConfig } from "./createSiteAdapter.js";
import type { RawSearchResult, SearchProvider } from "./types.js";

// A single shared headless browser, launched lazily on first search and
// reused for every subsequent one (launching Chromium fresh per query would
// add real, unnecessary latency on top of an already-slower browser-based
// fetch). Each individual search still gets its own isolated browser
// *context* (cookies/storage), so one query's session state never leaks
// into another's.
let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      executablePath: env.CHROMIUM_EXECUTABLE_PATH,
    });
  }
  return browserPromise;
}

/**
 * Closes the shared headless browser, if one was ever launched. Not called
 * anywhere in the running app (a long-lived server process just lets the OS
 * reap the browser process on exit, same as any other child process) - this
 * exists for tests, so a leaked browser doesn't hold `node:test` open after
 * the last test finishes.
 */
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const HONEST_UA = "ProductImageFinderBot/1.0 (+catalog-generation; contact: configure-in-env)";

/**
 * Builds a SearchProvider-conforming adapter that drives a real headless
 * Chromium browser instead of a plain HTTP fetch - for sites whose real
 * search results only exist after their own JavaScript runs (a plain fetch
 * only ever sees the pre-JS initial HTML, which for these sites is either
 * missing the results entirely or stale/generic markup - see
 * extractProductCandidates.ts's write-up of the farfetch.com bug this was
 * built to get past). Slower and heavier than createSiteAdapter.ts's plain
 * fetch (a real page load vs. one HTTP request) - only worth it for sites
 * that actually need it; see sites/configs.ts's `useBrowser` flag.
 *
 * Reuses the exact same extraction (extractProductCandidates.ts),
 * bot-check detection (botCheck.ts), and error-message differentiation
 * (BLOCKED/404/non-OK) as the plain-fetch adapter - only the "how do we get
 * the HTML" step is different, so both adapters stay behaviorally
 * consistent for the parts of createSiteAdapter.ts's logic below.
 */
export function createBrowserSiteAdapter(config: SiteAdapterConfig): SearchProvider {
  return {
    name: config.domain,
    isConfigured: () => true, // direct site search needs no credentials

    async search(query: string): Promise<RawSearchResult[]> {
      const searchUrl = config.buildSearchUrl(query);
      let lastError: unknown;

      for (let attempt = 0; attempt <= env.SITE_SEARCH_MAX_RETRIES; attempt++) {
        const browser = await getBrowser();
        const context = await browser.newContext({ userAgent: HONEST_UA });
        try {
          const page = await context.newPage();
          const response = await page.goto(searchUrl, {
            waitUntil: "domcontentloaded",
            timeout: env.BROWSER_NAV_TIMEOUT_MS,
          });

          // The initial HTML committed above is exactly what a plain fetch
          // would have seen - the real product grid (or a client-side
          // redirect to a single matching product) still has to run its own
          // JS after that. "networkidle" (no in-flight requests for 500ms)
          // is a generic, no-site-specific-knowledge-required proxy for
          // "probably done rendering." Some sites never truly go idle
          // (polling/analytics beacons) - proceed with whatever rendered so
          // far rather than failing the whole search over that.
          await page.waitForLoadState("networkidle", { timeout: env.BROWSER_NAV_TIMEOUT_MS }).catch(() => {});

          const status = response?.status() ?? 0;
          const html = await page.content();

          // Same three-way error differentiation as createSiteAdapter.ts -
          // see its comment for why lumping these together is the wrong call.
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
          // results-listing page, or the browser being redirected straight
          // to the one matching product page when the query has a unique
          // hit. If we ended up somewhere other than the search URL we
          // asked for, and that page itself already looks like a product
          // page, treat it as the single candidate instead of scanning it
          // for more links (a product page's own "you may also like" rail
          // would otherwise get misread as search results).
          if (finalUrl !== searchUrl && isProductPath(finalPath, config)) {
            const title = (await page.title().catch(() => "")) || "";
            return [{ url: finalUrl, title, snippet: "", domain: config.domain }];
          }

          const candidates = extractProductCandidates(html, finalUrl, {
            domain: config.domain,
            productUrlPattern: config.productUrlPattern,
            maxCandidates: config.maxCandidates,
          });

          return candidates.map((c) => ({
            url: c.url,
            title: c.title,
            snippet: "",
            domain: config.domain,
          }));
        } catch (err) {
          lastError = err;
          if (attempt < env.SITE_SEARCH_MAX_RETRIES) {
            await sleep(500 * Math.pow(2, attempt));
          }
        } finally {
          await context.close();
        }
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    },
  };
}
