import { fetchWithTimeout } from "../../lib/httpFetch.js";
import { env } from "../../env.js";
import { looksLikeBotBlock } from "./botCheck.js";
import { extractProductCandidates } from "./extractProductCandidates.js";
import type { RawSearchResult, SearchProvider } from "./types.js";

export interface SiteAdapterConfig {
  /** Bare domain, e.g. "hugoboss.com" - used both as RawSearchResult.domain and as the adapter's registry name. */
  domain: string;
  /** Builds this site's own on-site-search URL for a plain-text query. */
  buildSearchUrl(query: string): string;
  /** Optional per-site hint for recognizing a product-page href among search-results links. */
  productUrlPattern?: RegExp;
  maxCandidates?: number;
  /**
   * If true, sites/index.ts routes this config to createBrowserSiteAdapter.ts
   * (a real headless-browser fetch) instead of this plain-HTTP factory.
   * Ignored here - only read by sites/index.ts - but kept on the shared
   * config type so sites/configs.ts stays the single source of truth for
   * every site, regardless of which factory ends up building its adapter.
   */
  useBrowser?: boolean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds a SearchProvider-conforming adapter for one retailer's own on-site
 * search - no API key, no quota, just an honest HTTP fetch of that site's
 * public search-results page plus generic HTML parsing (extractProductCandidates.ts).
 * Shared here so the fetch/retry/bot-check plumbing is written once; each
 * site only supplies its own URL pattern and (optionally) a product-link hint.
 */
export function createSiteAdapter(config: SiteAdapterConfig): SearchProvider {
  return {
    name: config.domain,
    isConfigured: () => true, // direct site search needs no credentials

    async search(query: string): Promise<RawSearchResult[]> {
      const searchUrl = config.buildSearchUrl(query);
      let lastError: unknown;

      for (let attempt = 0; attempt <= env.SITE_SEARCH_MAX_RETRIES; attempt++) {
        try {
          const res = await fetchWithTimeout(searchUrl);
          const html = await res.text();

          // Distinguish "blocked" (bot-check/rate-limit) from "wrong URL"
          // (404 - the site responded normally, our search URL pattern is
          // just wrong) from any other non-OK status: these need very
          // different fixes (see sites/configs.ts for a live example), and
          // lumping them into one message hides which one applies.
          if (looksLikeBotBlock(res.status, html)) {
            throw new Error(`BLOCKED by ${config.domain} (status ${res.status}) - bot-check/rate-limit, not a URL problem`);
          }
          if (res.status === 404) {
            throw new Error(`404 from ${config.domain} - the search URL pattern is likely wrong, not blocked`);
          }
          if (!res.ok) {
            throw new Error(`Non-OK response from ${config.domain} (status ${res.status})`);
          }

          const candidates = extractProductCandidates(html, searchUrl, {
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
        }
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    },
  };
}
