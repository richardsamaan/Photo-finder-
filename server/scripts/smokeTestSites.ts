#!/usr/bin/env -S npx tsx
/**
 * Manual, live smoke test for the direct-site-search adapters.
 *
 * NOT part of the automated test suite (npm test only picks up
 * src/**\/*.test.ts) - this script makes real HTTP requests to all 5
 * retailer domains and is meant to be run by a human, on a machine with
 * real internet access, after changing a site adapter's URL pattern or
 * extraction logic.
 *
 * Why this exists: the sandbox this project has been developed in has no
 * outbound internet access, so none of the 5 site adapters' URL patterns or
 * HTML-parsing heuristics could be verified against the live, current
 * sites (see sites/configs.ts and the README for details). Run this after
 * any adapter change, from an environment with real network access, before
 * trusting it in production.
 *
 * Usage:
 *   npx tsx scripts/smokeTestSites.ts <styleCode> [colourName] [category]
 *   npm run smoke:sites -- <styleCode> [colourName] [category]
 *
 * Example:
 *   npx tsx scripts/smokeTestSites.ts 50512345 Black "T-Shirt"
 */
import { SITE_ADAPTERS } from "../src/services/searchProviders/sites/index.js";
import { runSiteSearch } from "../src/services/searchProviders/index.js";
import { fetchProductPage } from "../src/services/pageFetcher.js";
import { buildEscalatingQueries } from "../src/services/queryBuilder.js";

async function main() {
  const [styleCode, colour = "", category = ""] = process.argv.slice(2);
  if (!styleCode) {
    console.error("Usage: tsx scripts/smokeTestSites.ts <styleCode> [colourName] [category]");
    process.exit(1);
  }

  console.log(`Smoke-testing ${SITE_ADAPTERS.length} site adapters for: styleCode=${styleCode} colour=${colour} category=${category}`);
  console.log("This makes REAL requests to real retailer sites. Be polite - don't loop this.\n");

  const queries = buildEscalatingQueries({ styleCode, colour, category });
  console.log(`Escalating query attempts that would be tried: ${JSON.stringify(queries)}\n`);

  const query = queries[0];
  const { results } = await runSiteSearch(query);

  const bySite = new Map<string, typeof results>();
  for (const r of results) {
    const list = bySite.get(r.domain) ?? [];
    list.push(r);
    bySite.set(r.domain, list);
  }

  for (const adapter of SITE_ADAPTERS) {
    const siteResults = bySite.get(adapter.name) ?? [];
    console.log(`--- ${adapter.name} ---`);
    if (siteResults.length === 0) {
      console.log("  No candidates found (could be a genuine no-match, a blocked/failed request, or a URL-pattern/selector that needs updating - check server logs / site health for which).");
      continue;
    }
    console.log(`  ${siteResults.length} candidate(s):`);
    for (const r of siteResults.slice(0, 3)) {
      console.log(`    - ${r.url}  (title: "${r.title}")`);
    }

    const first = siteResults[0];
    const page = await fetchProductPage(first.url);
    if (!page) {
      console.log("  Could not fetch the first candidate's product page.");
    } else if (page.blockedByRobots) {
      console.log("  First candidate page is disallowed by robots.txt - skipped, as it should be.");
    } else if (page.images.length === 0) {
      console.log("  Fetched the product page but found no image - the gallery-selector fallback may need attention for this site.");
    } else {
      console.log(`  Product image resolved: ${page.images[0].url} (via ${page.images[0].alt || "generic <img> sweep"})`);
    }
    console.log("");
  }

  console.log("Done. Compare the above against what you see visiting these sites' search pages yourself in a browser.");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
