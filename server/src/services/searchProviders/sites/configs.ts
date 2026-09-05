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
//   hugoboss.com    - search URL works (200, real candidates) over a plain
//                     fetch, but the bare style-code query matched an
//                     unrelated kids'/junior category page, not the product.
//                     The .html-ending heuristic being too loose (fixed
//                     below) was part of it, but a second live run (with
//                     the fix in place) still returned the wrong product -
//                     a fuzzy/loose text-relevance match, not a URL or
//                     extraction bug. That points at the site's *own*
//                     search ranking, or at content this app's plain fetch
//                     still can't see (client-side re-ranking/filtering
//                     after the initial HTML) - moved to a real headless
//                     browser (`useBrowser: true`, see
//                     createBrowserSiteAdapter.ts) to read the fully
//                     rendered page rather than guess further blind.
//   farfetch.com    - the current search URL (`/search?q=`) is now
//                     user-confirmed correct, but a plain fetch of it
//                     returned the exact same 3 generic top-nav category
//                     links (Clothing/Shoes/Bags-style) for every query,
//                     regardless of what was searched. Part of that was the
//                     shared extractor's too-loose "any digit in the path"
//                     fallback matching short category ids (fixed for every
//                     site in extractProductCandidates.ts), but the bigger
//                     likely cause: farfetch.com's real results only render
//                     via client-side JS, which a plain fetch never
//                     executes - so the raw HTML it saw may never have
//                     contained real product links at all, regardless of
//                     URL or pattern correctness. Moved to a real headless
//                     browser (`useBrowser: true`) for exactly that reason -
//                     a live run also showed the browser can land directly
//                     on a single matching product page (a client-side
//                     redirect) instead of a listing page, which
//                     createBrowserSiteAdapter.ts handles as its own case.
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
// The single fastest way to get mrporter.com/endclothing.com's URLs exactly
// right: visit each site in a real browser, use its own search box, and
// copy the resulting URL - far more reliable than continuing to guess
// blind. Until then, treat every entry here as "needs confirmation" except
// hugoboss.com and farfetch.com's URLs, which are live-confirmed reachable
// (200) - what's unconfirmed for those two now is whether the *browser*
// adapter (useBrowser: true, see createBrowserSiteAdapter.ts) actually
// returns the correct product, not whether the URL itself is right.
export const SITE_CONFIGS: SiteAdapterConfig[] = [
  {
    domain: "hugoboss.com",
    buildSearchUrl: (q) => `https://www.hugoboss.com/us/search/?q=${encodeURIComponent(q)}`,
    // The generic fallback (any ".html" page) let category/listing pages
    // through as if they were product pages. Require a real product id
    // (a run of 6+ digits, matching the observed 8-digit style-code
    // convention) before the .html - still a guess, needs a live re-test.
    productUrlPattern: /\d{6,}[^/]*\.html$/i,
    // See the file-header write-up: two live runs both returned the wrong
    // product for an exact style-code query over a plain fetch. Reading
    // the fully-rendered page (client-side re-ranking/filtering, if any)
    // via a real browser is the next thing to try, not another URL guess.
    useBrowser: true,
  },
  {
    domain: "farfetch.com",
    // User-confirmed correct search URL pattern (?q=<styleCode>).
    buildSearchUrl: (q) => `https://www.farfetch.com/search?q=${encodeURIComponent(q)}`,
    // A live run (2026) returned the exact same 3 generic top-nav category
    // links (Clothing/Shoes/Bags-style) for every query, which turned out to
    // be partly the shared extractor's too-loose generic fallback matching
    // short category-id links (see extractProductCandidates.ts) - fixed
    // there for every site. This adds a farfetch-specific guard on top:
    // Farfetch's real product pages are conventionally named
    // "<slug>-item-<digits>.aspx" while category/listing pages are
    // "items.aspx" (plural, no id) - requiring "-item-<digits>" excludes the
    // listing pages even if they otherwise looked product-shaped. Still an
    // unverified guess (this sandbox has no outbound internet access): if
    // farfetch.com still returns only nav-style links after this, the next
    // thing to check is whether farfetch.com's search results are rendered
    // client-side. That's now the working theory a plain fetch's persistent
    // nav-links-only result points to, so this uses a real headless browser
    // (below) instead of another URL/pattern guess. The productUrlPattern
    // still matters with a browser in the picture: it also has to
    // recognize a direct client-side redirect straight to a single
    // matching product page (createBrowserSiteAdapter.ts's job, using this
    // same pattern), not just filter links on a listing page.
    productUrlPattern: /-item-\d+\.aspx(?:[/?#]|$)/i,
    useBrowser: true,
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
