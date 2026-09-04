import type { SiteAdapterConfig } from "../createSiteAdapter.js";

// Best-effort on-site search URL patterns and product-URL hints for each of
// the 5 target retailers, based on general knowledge of their commerce
// platforms' typical conventions (SFCC "/search?q=", Magento
// "/catalogsearch/result/?q=", etc).
//
// Trimmed from an initial 9 down to these 5: nordstrom.com, macys.com,
// bloomingdales.com, and zalando.com were dropped - they're large,
// high-traffic retailers that commonly run heavier bot-protection
// (Akamai/Cloudflare-style), making reliable scraping less likely to
// succeed and more effort to maintain. The 5 kept here are the official
// brand site plus smaller-to-mid retailers more likely to be
// scraping-tolerant, keeping this simpler and more reliable while it's
// still unverified against live sites.
//
// IMPORTANT: this sandbox has no outbound internet access (documented
// constraint in every session on this project), so NONE of these URL
// patterns or the generic extraction they feed into could be verified
// against the real, live site. Treat every entry here as "needs
// confirmation against production" until the manual smoke-test script
// (scripts/smokeTestSites.ts) has actually been run against the internet.
export const SITE_CONFIGS: SiteAdapterConfig[] = [
  {
    domain: "hugoboss.com",
    buildSearchUrl: (q) => `https://www.hugoboss.com/us/search/?q=${encodeURIComponent(q)}`,
  },
  {
    domain: "farfetch.com",
    buildSearchUrl: (q) => `https://www.farfetch.com/shopping/search/?q=${encodeURIComponent(q)}`,
  },
  {
    domain: "mrporter.com",
    buildSearchUrl: (q) => `https://www.mrporter.com/en-us/search/?keywords=${encodeURIComponent(q)}`,
  },
  {
    domain: "selfridges.com",
    buildSearchUrl: (q) => `https://www.selfridges.com/US/en/search/?q=${encodeURIComponent(q)}`,
  },
  {
    domain: "endclothing.com",
    buildSearchUrl: (q) => `https://www.endclothing.com/us/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  },
];
