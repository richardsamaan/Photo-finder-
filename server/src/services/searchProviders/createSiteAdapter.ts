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

          if (!res.ok || looksLikeBotBlock(res.status, html)) {
            throw new Error(`Blocked or non-OK response from ${config.domain} (status ${res.status})`);
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
