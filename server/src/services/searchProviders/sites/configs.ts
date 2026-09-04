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
// against the real, live site directly by this session. The status notes
// below (as of the first live run, from a real machine with a realistic
// browser header set - see server/scripts/standalone-site-test/) are the
// actual ground truth; keep them updated as this gets re-tested.
//
//   hugoboss.com    - search URL works (200, real candidates). BUT the
//                     bare style-code query matched an unrelated kids'/
//                     junior category *listing* page, not the product -
//                     the generic .html-ending heuristic was too loose and
//                     let a category page through as if it were a PDP
//                     (hence also "product image" = the site's generic
//                     logo, since a listing page has no single product
//                     image/og:image). Fixed below with a tighter
//                     `productUrlPattern` that requires a real numeric
//                     product id in the URL, not just any `.html` page.
//                     Still needs a live re-test to confirm the fix.
//   farfetch.com    - search URL returns 404 (not blocked - just wrong
//                     path). Best-effort alternate guess below, still
//                     unverified.
//   mrporter.com    - same: 404, not blocked. Best-effort alternate guess
//                     below, still unverified.
//   endclothing.com - same: 404, not blocked. Best-effort alternate guess
//                     below, still unverified.
//   selfridges.com  - still 403 even with realistic browser headers
//                     (User-Agent, Accept, Accept-Language, Sec-Fetch-*).
//                     That's a materially different signal than the 404s
//                     above: headers alone didn't flip it, which is
//                     consistent with heavier bot management (TLS
//                     fingerprinting and/or a JS challenge) that a plain
//                     HTTP client can't satisfy regardless of headers - see
//                     the README for what that would take to work around.
//
// The single fastest way to get farfetch.com/mrporter.com/endclothing.com
// exactly right: visit each site in a real browser, use its own search box,
// and copy the resulting URL - far more reliable than continuing to guess
// blind. Until then, treat every entry here as "needs confirmation."
export const SITE_CONFIGS: SiteAdapterConfig[] = [
  {
    domain: "hugoboss.com",
    buildSearchUrl: (q) => `https://www.hugoboss.com/us/search/?q=${encodeURIComponent(q)}`,
    // The generic fallback (any ".html" page) let category/listing pages
    // through as if they were product pages. Require a real product id
    // (a run of 6+ digits, matching the observed 8-digit style-code
    // convention) before the .html - still a guess, needs a live re-test.
    productUrlPattern: /\d{6,}[^/]*\.html$/i,
  },
  {
    domain: "farfetch.com",
    // Alternate guess after the original /shopping/search/ path 404'd -
    // still unverified, please confirm against the real site.
    buildSearchUrl: (q) => `https://www.farfetch.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    domain: "mrporter.com",
    // Alternate guess (singular "keyword", no trailing slash) after the
    // original 404'd - still unverified, please confirm against the real site.
    buildSearchUrl: (q) => `https://www.mrporter.com/en-us/search?keyword=${encodeURIComponent(q)}`,
  },
  {
    domain: "selfridges.com",
    buildSearchUrl: (q) => `https://www.selfridges.com/US/en/search/?q=${encodeURIComponent(q)}`,
  },
  {
    domain: "endclothing.com",
    // Alternate guess (dropped the assumed Magento /catalogsearch/result/
    // path, which 404'd) after the original 404'd - still unverified,
    // please confirm against the real site.
    buildSearchUrl: (q) => `https://www.endclothing.com/search?q=${encodeURIComponent(q)}`,
  },
];
