// Common contract every site-search adapter implements. Swapping/adding a
// retailer = implementing this interface + registering it in sites/index.ts.
// No adapter may invent or fabricate results - if a site's search page
// yields nothing (or looks blocked), the adapter returns an empty array or
// throws, it never synthesizes data.

export interface RawSearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  imageUrl?: string;
}

export interface SearchProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Run one text query against this site's own on-site search. Throws on a fetch/parse failure or a detected bot-check; returns [] for a legitimate no-results page. */
  search(query: string): Promise<RawSearchResult[]>;
}
