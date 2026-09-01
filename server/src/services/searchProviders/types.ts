// Common contract every search-provider adapter must implement.
// Swapping providers = implementing this interface + registering it in index.ts.
// No adapter may invent or fabricate results - if the underlying API returns
// nothing, the adapter must return an empty array, never synthesized data.

export interface RawSearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  imageUrl?: string;
}

export interface SearchProvider {
  readonly name: string;
  /** True only when this adapter has the credentials it needs to run. */
  isConfigured(): boolean;
  /** Run one text query against the provider. Must not throw for "no results". */
  search(query: string): Promise<RawSearchResult[]>;
  /**
   * Optional: fetch page content for verification (style code / colour / category
   * evidence extraction). Providers that only do search (no scrape) should omit this
   * and let the generic pageFetcher.ts handle it via direct HTTP fetch.
   */
  fetchPageContent?(url: string): Promise<{ text: string; images: string[] } | null>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Search provider "${provider}" is not configured. Set the required API key env vars.`);
    this.name = "ProviderNotConfiguredError";
  }
}
