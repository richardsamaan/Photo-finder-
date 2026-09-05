#!/usr/bin/env -S npx tsx
/**
 * Manual, live smoke test for the direct-site-search adapters.
 *
 * NOT part of the automated test suite (npm test only picks up
 * src/**\/*.test.ts) - this script makes real HTTP requests to real
 * retailer domains and is meant to be run by a human, on a machine with
 * real internet access, after changing a site adapter's URL pattern or
 * extraction logic.
 *
 * Why this exists: the sandbox this project has been developed in has no
 * outbound internet access, so none of the site adapters' URL patterns or
 * HTML-parsing heuristics could be verified against the live, current
 * sites (see sites/configs.ts and the README for details). Run this after
 * any adapter change, from an environment with real network access, before
 * trusting it in production.
 *
 * Requires the full server workspace to be installed (this script imports
 * the real app's source directly), including native/compiled deps
 * (better-sqlite3, sharp) that need a C++ toolchain to build from source on
 * platforms with no matching prebuilt binary. If `npm install` fails for
 * that reason (e.g. on Windows without build tools installed), use
 * scripts/standalone-site-test/ instead - a fully separate copy of this
 * same search+extraction smoke test with its own tiny package.json (just
 * cheerio, no native deps).
 *
 * Usage:
 *   npx tsx scripts/smokeTestSites.ts <styleCode> [colourName] [colourCode]
 *   npm run smoke:sites -w server -- <styleCode> [colourName] [colourCode]
 *
 * Optional env var:
 *   SITES=hugoboss.com,farfetch.com   restrict to just these domains
 *
 * Example (all sites):
 *   npx tsx scripts/smokeTestSites.ts 50512345 Black 009
 * Example (just two confirmed-reachable sites):
 *   SITES=hugoboss.com,farfetch.com npx tsx scripts/smokeTestSites.ts 50469055 Black 009
 */
import * as cheerio from "cheerio";
import { SITE_ADAPTERS, SITE_CONFIGS } from "../src/services/searchProviders/sites/index.js";
import { runSiteSearch, getSiteHealthSnapshot } from "../src/services/searchProviders/index.js";
import { fetchProductPage } from "../src/services/pageFetcher.js";
import { buildEscalatingQueries } from "../src/services/queryBuilder.js";
import { fetchWithTimeout } from "../src/lib/httpFetch.js";

const ATTEMPT_LABELS = ["Style Code alone", "+ Colour Name", "+ Colour Code"];

/**
 * Raw, un-filtered look at a site's search-results page, bypassing the
 * adapter/extraction logic entirely - added after a live run (2026) where
 * farfetch.com returned the exact same 3 generic nav links for every query,
 * which turned out to be partly a too-loose extraction fallback (fixed) but
 * could equally have been "the search URL redirected somewhere else" or
 * "the real results are rendered client-side and never appear in the raw
 * HTML at all" (which no plain HTTP fetch, however well-patterned, could
 * ever see). This prints enough to tell those apart at a glance.
 */
async function diagnoseSearchPage(domain: string, url: string) {
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
        return new URL(h, url).hostname.replace(/^www\./, "").endsWith(domain.replace(/^www\./, ""));
      } catch {
        return false;
      }
    }).length;
    console.log(
      `    [diagnostic] status=${res.status}, ${hrefs.length} total <a href> on the raw page (${sameDomainCount} same-domain). ` +
        (hrefs.length < 5
          ? "Very few links at all - this page may be a JS shell whose real content never appears in the raw HTML."
          : "")
    );
  } catch (err) {
    console.log(`    [diagnostic] Could not fetch the raw search page directly: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  const [styleCode, colour = "", colourCode = ""] = process.argv.slice(2);
  if (!styleCode) {
    console.error("Usage: tsx scripts/smokeTestSites.ts <styleCode> [colourName] [colourCode]");
    console.error('Example: tsx scripts/smokeTestSites.ts 50469055 Black 009');
    process.exit(1);
  }

  const onlySites = process.env.SITES?.split(",").map((s) => s.trim()).filter(Boolean);
  const adapters = onlySites ? SITE_ADAPTERS.filter((a) => onlySites.includes(a.name)) : SITE_ADAPTERS;
  if (adapters.length === 0) {
    console.error(`No matching site adapters for SITES=${process.env.SITES}. Available: ${SITE_ADAPTERS.map((a) => a.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`Smoke-testing ${adapters.length} site adapter(s) for: styleCode=${styleCode} colour=${colour} colourCode=${colourCode}`);
  console.log(`Sites: ${adapters.map((a) => a.name).join(", ")}`);
  console.log("This makes REAL requests to real retailer sites. Be polite - don't loop this.\n");

  const queries = buildEscalatingQueries({ styleCode, colour, colourCode });
  console.log(`Escalating query attempts: ${JSON.stringify(queries)}`);
  console.log("Runs ALL of these per site (not just attempt 1) - eyeball the results yourself; this is");
  console.log("still just search/extraction, not the full confidence-scoring pipeline the actual app runs.\n");

  for (const adapter of adapters) {
    console.log(`=== ${adapter.name} ===`);

    const config = SITE_CONFIGS.find((c) => c.domain === adapter.name);
    if (config) {
      await diagnoseSearchPage(adapter.name, config.buildSearchUrl(queries[0]));
    }

    for (const [i, query] of queries.entries()) {
      console.log(`  [Attempt ${i + 1}: ${ATTEMPT_LABELS[i]}] query="${query}"`);
      const { results } = await runSiteSearch(query, { adapters: [adapter] });

      if (results.length === 0) {
        console.log("    No candidates found (could be a genuine no-match, a blocked/failed request, or a URL-pattern/selector that needs updating - check server logs / site health for which).");
        continue;
      }

      console.log(`    ${results.length} candidate(s):`);
      for (const r of results.slice(0, 3)) {
        console.log(`      - ${r.url}  (title: "${r.title}")`);
      }

      const first = results[0];
      const page = await fetchProductPage(first.url);
      if (!page) {
        console.log("    Could not fetch the first candidate's product page.");
      } else if (page.blockedByRobots) {
        console.log("    First candidate page is disallowed by robots.txt - skipped, as it should be.");
      } else if (page.images.length === 0) {
        console.log("    Fetched the product page but found no image - the gallery-selector fallback may need attention for this site.");
      } else {
        console.log(`    Product image resolved: ${page.images[0].url} (via ${page.images[0].alt || "generic <img> sweep"})`);
      }
    }
    console.log("");
  }

  // runSiteSearch() swallows individual site errors into an empty result
  // (so one failing site never aborts the fan-out), which means "0
  // candidates" above can't tell you WHY. Print the real per-site
  // success/failure/lastError here, same signal the Job Detail page's
  // site-health panel shows, so "blocked" vs "wrong URL" vs "genuinely no
  // results" doesn't require another round-trip to find out.
  console.log("--- Site health (why each 0-candidate result happened, if it did) ---");
  const health = getSiteHealthSnapshot();
  for (const adapter of adapters) {
    const h = health[adapter.name];
    if (!h) continue;
    console.log(
      `  ${adapter.name}: ${h.succeeded}/${h.attempts} succeeded, ${h.resultsReturned} result(s) returned` +
        (h.lastError ? ` - lastError: ${h.lastError}` : "")
    );
  }

  console.log("\nDone. Compare the above against what you see visiting these sites' search pages yourself in a browser.");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
