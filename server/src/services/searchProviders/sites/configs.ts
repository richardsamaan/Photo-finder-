import type { SiteAdapterConfig } from "../createSiteAdapter.js";

// Best-effort on-site search URL patterns and product-URL hints for each of
// the 9 target retailers, based on general knowledge of their commerce
// platforms' typical conventions (SFCC "/search?q=", Magento
// "/catalogsearch/result/?q=", Nordstrom's "/sr?keyword=", etc).
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
    domain: "bloomingdales.com",
    buildSearchUrl: (q) => `https://www.bloomingdales.com/shop/search?keyword=${encodeURIComponent(q)}`,
  },
  {
    domain: "zalando.com",
    buildSearchUrl: (q) => `https://www.zalando.com/catalog/?q=${encodeURIComponent(q)}`,
  },
  {
    domain: "endclothing.com",
    buildSearchUrl: (q) => `https://www.endclothing.com/us/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  },
  {
    domain: "nordstrom.com",
    buildSearchUrl: (q) => `https://www.nordstrom.com/sr?keyword=${encodeURIComponent(q)}`,
  },
  {
    domain: "macys.com",
    buildSearchUrl: (q) => `https://www.macys.com/shop/search?keyword=${encodeURIComponent(q)}`,
  },
];
