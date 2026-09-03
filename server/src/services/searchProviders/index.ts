import { SITE_ADAPTERS } from "./sites/index.js";
import { politeDelay } from "./politeness.js";
import { recordSiteSuccess, recordSiteFailure, getSiteHealthSnapshot, resetSiteHealth } from "./health.js";
import { isDomainAllowed, type DomainFilterMode } from "../sourceTier.js";
import type { RawSearchResult, SearchProvider } from "./types.js";

export interface SiteSearchOptions {
  domainFilterMode?: DomainFilterMode;
  officialDomain?: string | null;
  /** Test-only override - defaults to the real 9-site registry. */
  adapters?: SearchProvider[];
}

/**
 * Fans a single text query out to every enabled site adapter (or the subset
 * that survives the job's domain filter), respecting each site's own
 * politeness delay, and aggregates whatever candidates come back. A site
 * that errors or looks blocked is recorded in health.ts and skipped for
 * this query - it never aborts the run.
 */
export async function runSiteSearch(
  query: string,
  opts: SiteSearchOptions = {}
): Promise<{ results: RawSearchResult[] }> {
  const mode = opts.domainFilterMode ?? "none";
  const registry = opts.adapters ?? SITE_ADAPTERS;
  const candidates: SearchProvider[] =
    mode === "none" ? registry : registry.filter((s) => isDomainAllowed(s.name, mode, opts.officialDomain));

  const perSite = await Promise.all(
    candidates.map(async (site) => {
      await politeDelay(site.name);
      try {
        const results = await site.search(query);
        recordSiteSuccess(site.name, results.length);
        return results;
      } catch (err) {
        recordSiteFailure(site.name, err instanceof Error ? err.message : String(err));
        return [];
      }
    })
  );

  return { results: perSite.flat() };
}

export { SITE_ADAPTERS, getSiteHealthSnapshot, resetSiteHealth };
export type { RawSearchResult, SearchProvider };
