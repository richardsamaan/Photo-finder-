import { env } from "../../env.js";
import { googleCseProvider } from "./googleCse.js";
import { firecrawlProvider } from "./firecrawl.js";
import { serpApiProvider } from "./serpApi.js";
import { bingProvider } from "./bing.js";
import type { RawSearchResult, SearchProvider } from "./types.js";
import { ProviderNotConfiguredError } from "./types.js";
import { consumeQuota } from "../quotaGovernor.js";

const registry: Record<string, SearchProvider> = {
  google_cse: googleCseProvider,
  firecrawl: firecrawlProvider,
  serpapi: serpApiProvider,
  bing: bingProvider,
};

export function getActiveProvider(): SearchProvider | null {
  if (env.SEARCH_PROVIDER === "none") return null;
  return registry[env.SEARCH_PROVIDER] ?? null;
}

export function isSearchConfigured(): boolean {
  const p = getActiveProvider();
  return Boolean(p && p.isConfigured());
}

// Simple global rate limiter shared across all provider calls so we never
// hammer the provider regardless of how many jobs run concurrently.
let lastCallAt = 0;
async function throttle() {
  const now = Date.now();
  const wait = lastCallAt + env.SEARCH_RATE_LIMIT_MS - now;
  lastCallAt = Math.max(now, lastCallAt + env.SEARCH_RATE_LIMIT_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runSearch(
  query: string
): Promise<{ provider: string; results: RawSearchResult[]; error?: string }> {
  const provider = getActiveProvider();
  if (!provider || !provider.isConfigured()) {
    throw new ProviderNotConfiguredError(env.SEARCH_PROVIDER);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= env.SEARCH_MAX_RETRIES; attempt++) {
    try {
      await throttle();
      // Counts every real HTTP call to the provider (including retries) against
      // the shared daily quota - see services/quotaGovernor.ts.
      consumeQuota(1);
      const results = await provider.search(query);
      return { provider: provider.name, results };
    } catch (err) {
      lastError = err;
      if (attempt < env.SEARCH_MAX_RETRIES) {
        await sleep(500 * Math.pow(2, attempt));
      }
    }
  }
  return {
    provider: provider.name,
    results: [],
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

export function getProviderForContentFetch(): SearchProvider | null {
  return getActiveProvider();
}

export { registry as searchProviderRegistry };
export type { RawSearchResult, SearchProvider };
