# Product Image Finder & Catalog Generator

A production web app that takes an uploaded product list (Style Code, Colour,
Category, optional Season), searches for each exact product by directly
querying retailers' own on-site search (no third-party search API, no API
key, no billing risk anywhere in the pipeline), verifies the match with
evidence (not visual guessing), lets a human review/approve every image, then
generates a category-organized, grid-layout PDF catalog and a downloadable
ZIP.

**No fake data. No simulated search.** A site adapter that fails or looks
blocked is skipped for that item and recorded in per-site health tracking -
it never falls back to inventing a result.

For a one-off lookup that doesn't need the full CSV import → review → PDF
flow, there's also a **Quick Search** tool - see §1a.

---

## 1a. Quick Search (single-item lookup)

A lightweight, dependency-free single HTML page (`web/public/quick-search.html`,
plain HTML/JS, no build step of its own) for finding photos of one item
without going through the import wizard. Linked from the main app's navbar,
and served at `/quick-search.html` in both dev (via Vite's `public/` dir) and
production (Express static, since `vite build` copies `public/` into `dist/`).

- **Fields**: item name/description (required), an optional colour name
  (e.g. "burgundy"), and an optional colour hex code (e.g. `#7B1E3A`, with a
  colour-picker synced to the text field).
- **Search**: runs on the same 9 direct on-site search adapters as the main
  catalog pipeline (`services/searchProviders/sites/`) - there is no separate
  general-web-search or dedicated image-search API. `queryBuilder.buildQuickSearchQueries`
  generates several phrasing variations (raw query, `+ "product photo"`,
  `+ "high resolution"`, `+ "official product image"`, `+ "studio photo white
  background"`, plus colour-qualified passes when a colour name is given);
  each candidate product page found is then actually fetched
  (`fetchProductPage`, the same function the catalog pipeline uses) to
  resolve its real product image.
- **Quality filtering**: known stock-photo domains (iStock, Shutterstock,
  Getty, Alamy, etc.) and URLs containing "watermark" are dropped. Every
  remaining candidate's real pixel dimensions are probed (bounded,
  concurrency-limited HTTP fetch + `sharp` metadata read) and anything under
  800px on its shortest side is rejected.
- **Ranking**: survivors are sorted by resolution (bigger wins); when a
  colour hex is supplied, each candidate's dominant colour is sampled
  (`sharp().resize(1,1)`) and compared to the target via RGB Euclidean
  distance, which nudges closer colour matches upward without ever zeroing
  out an otherwise strong, high-resolution photo. The top 8-10 are returned.
- **Backend**: `POST /api/quick-search` (`server/src/routes/quickSearch.ts` →
  `server/src/services/imageSearch.ts`).

---

## 1b. Direct on-site search (no API key, no quota)

Search works by directly querying each of **5 target retailers'** own
on-site search - no Google/Bing/Firecrawl/SerpAPI, no API key, and no
external quota anywhere in the pipeline:

```
hugoboss.com   farfetch.com   mrporter.com   selfridges.com   endclothing.com
```

Trimmed down from an initial 9: `nordstrom.com`, `macys.com`,
`bloomingdales.com`, and `zalando.com` were dropped - they're large,
high-traffic retailers that commonly run heavier bot-protection
(Akamai/Cloudflare-style), making reliable scraping less likely to succeed
and more effort to maintain. The 5 kept are the official brand site plus
smaller-to-mid retailers more likely to be scraping-tolerant, keeping this
simpler and more reliable while it's still unverified against live sites
(see the callout below).

- **Per-site adapters** (`services/searchProviders/sites/`): each retailer
  gets a `SearchProvider`-conforming adapter (the same interface the app's
  original API-key-based providers used - only the data source changed) built
  via a shared factory (`createSiteAdapter.ts`) so the fetch/retry/bot-check
  plumbing is written once. Each adapter builds that site's own search URL,
  fetches the results page, and extracts candidate product-page links
  (`extractProductCandidates.ts` - a generic, domain-scoped anchor-tag parser,
  not brittle per-site CSS classes). Every candidate then goes through the
  **same, unchanged verification/matching engine** (`verification.ts`,
  `matching.ts`) regardless of which of the 5 sites it came from.
- **Image extraction** (`services/pageFetcher.ts`): once a candidate product
  page is fetched, the primary image is resolved through a priority chain -
  `og:image` first, then schema.org JSON-LD `Product.image`, then a handful
  of common product-gallery selectors, then any image on the page - so the
  best available guess is always used even when `og:image` is missing or
  wrong.
- **Escalating attempts, re-anchored to accuracy, not cost**
  (`services/queryBuilder.ts` → `buildEscalatingQueries`,
  `services/productSearch.ts`): since there's no external quota to conserve
  anymore, an item's attempts run back-to-back in one call, stopping as soon
  as a confident match is found:
  1. Style Code alone, across all 5 sites.
  2. Style Code + Colour Name, only if attempt 1 wasn't confident.
  3. Style Code + Colour Name + Category, only if attempt 2 wasn't confident.
- **Politeness, not quota** (`services/searchProviders/politeness.ts`): a
  configurable minimum delay (`SITE_SEARCH_DELAY_MS`, default 1500ms) between
  two requests to the *same* retailer - tracked per domain, so a run against
  all 5 sites doesn't needlessly serialize across different retailers. A full
  run processes the whole item list in one pass, bounded only by this delay
  and normal runtime; **Pause/Resume** stays available for practical reasons
  (long runtimes, wanting to check progress), not because of any quota.
- **Per-site health tracking** (`services/searchProviders/health.ts`): simple
  in-process success/failure counters per site (shown on the Job Detail
  page) - "succeeded" means the fetch+parse completed normally (a legitimate
  zero-results page still counts as healthy), "failed" means a network
  error, non-2xx response, or a detected bot-check/CAPTCHA wall
  (`botCheck.ts`). A failing site is simply skipped for that item, never a
  hard pipeline failure.
- **Optional source-domain filter**: each job can restrict search results to
  the official brand domain only, the official domain plus a curated
  allowlist of major retailers (`services/sourceTier.ts`), or no restriction
  - set at import time or later from the Job Detail page.
- Regenerating the PDFs/ZIP always reflects the job's full current state
  (every approved product so far) - there's no per-run partial export to
  merge by hand. A **Not Found (.xlsx)** download on the Job Detail page
  lists everything still unresolved, in the same column format as the input.
- "Search Selected" and "Retry Failed" run the same escalating pipeline for
  just the items you pick, on demand.

> **This sandbox has no outbound internet access** (documented in every
> session on this project - only the npm registry is reachable through its
> proxy), so **none of the 5 adapters' URL patterns or extraction heuristics
> could be verified against the live, current sites.** They were built
> against general, best-effort knowledge of each retailer's typical
> commerce-platform conventions - see `sites/configs.ts` for exactly which
> parts are unverified, and run `npm run smoke:sites -w server -- <styleCode>
> [colour] [category]` (from a machine with real internet access) before
> trusting this in production. See §6 for what *was* verified automatically.

---

## 1. Architecture

```
Photo-finder-/
  server/    Node.js + TypeScript + Express API, SQLite (better-sqlite3 + Drizzle ORM)
  web/       React + TypeScript + Vite + Tailwind CSS (mobile-first)
  storage/   Runtime data: uploads, generated catalog (images + PDFs + ZIP)
```

- **Backend**: Express REST API. SQLite via `better-sqlite3` (zero-config,
  file-based - no external DB server to install) with a thin Drizzle ORM
  layer for typed queries. Hand-written idempotent SQL migrations
  (`server/src/db/migrate.ts`) run automatically on boot.
- **Frontend**: React + Vite + Tailwind, single-page app with 4 screens
  (Dashboard, Import Wizard, Job Detail/Review Grid, Product Review).
  Mobile-first responsive layout, tested at 412×915 (Galaxy S24 Ultra),
  820×1180 (tablet), and 1440×900 (desktop).
- **Search**: a `SearchProvider` interface
  (`server/src/services/searchProviders/types.ts`) with 9 direct-site
  adapters (see §1b) fanned out per query by `runSiteSearch`
  (`searchProviders/index.ts`). Adding a 10th retailer means adding one
  config entry to `sites/configs.ts` - no new interface, no API key.

---

## 2. How the matching/verification logic works

1. **Query generation** (`services/queryBuilder.ts`): 3 escalating attempts
   per product, most-specific-needed first (Style Code; +Colour; +Category -
   see §1b). Each site's own search engine tokenizes the plain-text query the
   same way a shopper typing into its search box would.
2. **Search**: each attempt is fanned out to every enabled site adapter in
   parallel, with a per-site politeness delay (`searchProviders/index.ts`).
   Duplicate URLs across sites are de-duplicated.
3. **Page verification** (`services/pageFetcher.ts` + `robotsCheck.ts`): for
   each candidate URL (top 8), the app checks `robots.txt` before fetching,
   then does a direct HTTP GET + HTML text/meta/image extraction (`cheerio`).
   Disallowed pages are never fetched - they're scored from the listing title
   only.
4. **Evidence scoring** (`services/verification.ts` + `matching.ts`,
   unchanged by the search-backend pivot): the style code is checked as a
   real token match (word-boundary and separator-tolerant, e.g. `5051-2345`
   still matches `50512345`) - **never** a substring match that could hit
   inside an unrelated longer number.
   - No style-code match → confidence hard-capped at 15 (`NEEDS REVIEW`,
     never higher, regardless of how good everything else looks).
   - Style-code match but a *different* colour explicitly stated on the page
     → confidence strongly penalized (−40).
   - Colour confirmed, category confirmed, and a recognized reliable-retailer
     domain each add bounded bonuses.
   - Final score is clamped 0-100 and classified: **90-100 High Confidence**,
     **70-89 Medium Confidence**, **below 70 Needs Review**.
5. **Ranking** (`rankCandidates`): style-code match is the primary sort key
   - a candidate without a code match can never outrank one with a match,
   no matter its raw score. This directly implements the "style code beats
   visual similarity" requirement, and applies identically no matter which
   of the 5 sites a candidate came from.
6. Nothing is ever auto-approved. The best candidate becomes the product's
   suggested image/status; a human must explicitly Approve, Reject, pick a
   different candidate, or upload their own image before it's downloaded.

Unit tests for all of this logic live in `server/src/services/*.test.ts` and
`server/src/lib/*.test.ts` (see §6).

---

## 3. Setup

### Prerequisites
- Node.js ≥ 20
- npm

### Install

```bash
git clone <this-repo>
cd Photo-finder-
cp .env.example .env      # then edit .env - see §4 (optional, sane defaults ship)
npm install --workspaces  # installs server + web deps
npm run db:push           # creates the SQLite DB and tables
```

### Run in development

```bash
npm run dev
```

This runs the API on `http://localhost:4000` and the Vite dev server on
`http://localhost:5173` (which proxies `/api` and `/storage` to the API).
Open `http://localhost:5173`.

### Run in production

```bash
npm run build              # builds server (tsc) and web (vite build)
NODE_ENV=production npm run start
```

In production the Express server also serves the built frontend from
`web/dist`, so you only need one process/port (`PORT` from `.env`).

---

## 4. Environment variables (`.env`)

Copy `.env.example` to `.env`. Search itself needs no configuration at all -
every variable below is an optional tuning knob:

| Variable | Required | Description |
|---|---|---|
| `PORT` | no (default 4000) | API server port |
| `DATABASE_PATH` | no | SQLite file path (relative to repo root) |
| `STORAGE_DIR` | no | Where uploads/images/PDFs/ZIPs are written |
| `CORS_ORIGIN` | no | Allowed frontend origin |
| `SEARCH_CONCURRENCY` | no (default 3) | Parallel products processed at once |
| `SITE_SEARCH_DELAY_MS` | no (default 1500) | Minimum gap between two requests to the *same* retailer site (politeness, not cost) |
| `SITE_SEARCH_MAX_RETRIES` | no (default 1) | Retries per site fetch on a network error |
| `FETCH_TIMEOUT_MS` | no (default 12000) | Timeout for any single outbound HTTP request |
| `MAX_UPLOAD_MB` / `MAX_IMAGE_MB` | no | Upload size limits |

---

## 5. How to use it

1. **Upload** an `.xlsx`, `.xls`, or `.csv` file with Style Code, Colour, and
   Category columns (common header variants like `SKU`, `Color`, `Product
   Type` are auto-detected); an optional Season column is also detected if
   present (`Season`, `Collection`, `Drop`, etc.).
2. **Map columns** - auto-detected mapping is pre-filled; change any dropdown
   if needed. A live preview table and Total Products / Total Categories
   counters update as you adjust the mapping. Also choose a **source-domain
   restriction** (none / official domain only / official + trusted
   retailers) - see §1b.
3. **Confirm Import** (or Cancel) - creates the job and every product row.
4. On the **Job Detail** page: **Start Search** runs the escalating search
   across the whole job (Style Code → +Colour → +Category per item, across
   all 5 sites - see §1b), or **Pause / Resume / Cancel / Retry Failed /
   Search Selected** while it runs. Live stats (Total, Images Found,
   High/Medium Confidence, Needs Review, Not Found, Approved, Rejected,
   Failed, Pending), per-site health, and a progress bar update
   automatically. The source-domain restriction can also be changed here at
   any time.
5. Open any product to **Review**: see the image, evidence notes, confidence,
   source. **Approve** downloads and stores the image; **Reject** discards
   it; **Search Again** re-runs the pipeline (bypassing cache); **Find
   Another Image** shows every candidate side-by-side with its own evidence
   badges so you can manually pick a different one; **Upload Image** lets you
   supply your own file when nothing found online is right.
6. Back on the Job Detail page, **Generate PDFs** builds every category PDF
   plus the master `Product_Image_Catalog.pdf` - a grid layout (multiple
   products per page), grouped by category and sorted by Season within each
   group, with each tile showing the photo, Style Code, and a Colour
   swatch + label (no item name or source link on the tile itself); **Generate
   ZIP** bundles the full `Product_Catalog/` folder (images + PDFs) into
   `Product_Catalog.zip`. Both are always regenerated fresh from the job's
   full current state, so re-running them after any run picks up everything
   approved so far in one file - never a separate file per run.
   Download links appear immediately after generation, plus a **Not Found
   (.xlsx)** link once any items remain unresolved.

---

## 6. Testing performed

**Automated (93 passing tests, `npm test -w server`):**
- Direct-site-search adapters (added with this pivot), all using **saved,
  hand-built HTML fixtures - no live network calls in the test suite**:
  - `extractProductCandidates.test.ts` (8 tests): real product tiles are
    extracted and nav/account/footer/cross-domain chrome is ignored; relative
    hrefs resolve against the search page URL; title falls back
    aria-label → image alt → link text; `maxCandidates` and a per-site
    `productUrlPattern` override both work; repeated links de-dupe; a
    legitimate zero-results page returns `[]`.
  - `createSiteAdapter.test.ts` (7 tests, mocked global `fetch`): correctly
    parses an SFCC-style results page (hugoboss.com-like), a Magento-style
    results page (endclothing.com-like), and a JSON-LD-carrying results page
    (department-store-like); a zero-results page is not an error; a
    bot-check/CAPTCHA response and a non-OK HTTP status both throw (after
    retrying) rather than fabricating a result.
  - `botCheck.test.ts` (5 tests): flags 403/429/503 and common CAPTCHA/block
    page text; does not flag an ordinary 200 response or a legitimate
    "no results found" page.
  - `configs.test.ts` (4 tests): all 5 target domains are present; every
    config builds an `https://` URL on its own domain; queries are
    URL-encoded; the query appears in some query-string parameter.
  - `politeness.test.ts` (3 tests): a domain's first request isn't delayed;
    a second request to the *same* domain waits out the configured delay;
    a *different* domain is never held up by another site's timer.
  - `searchProviders/index.test.ts` (7 tests, fake in-test adapters): fans a
    query out to every adapter and aggregates results; a failing adapter is
    skipped, not fatal; success/failure/result-count are recorded correctly
    per site (including that a legitimate zero-results adapter still counts
    as a success); all three domain-filter modes work.
  - `queryBuilder.test.ts` (5 tests): the 3 escalating attempts build
    correctly, Category is only appended when present, a blank Colour
    collapses attempts 1 and 2, and whitespace is normalized.
  - `pageFetcher.test.ts` (8 tests, mocked global `fetch`): the
    og:image → JSON-LD `Product.image` (string, array, or `ImageObject`) →
    gallery-selector → any-`<img>` priority chain resolves correctly at each
    fallback level; malformed JSON-LD doesn't break the fetch; a non-HTML
    response returns `null`.
  - `fileParser.test.ts` additions (carried over): Season column
    auto-detection (including aliases like `Collection`/`Drop`), Season
    staying optional and never affecting mapping confidence, and Category
    alias variants (`Product Group`, `Line`).
- Quick Search (`imageSearch.test.ts`, 11 tests): query-variation generation
  and de-dupe; real width/height decoding from an in-memory `sharp`-generated
  image; dominant-colour extraction; hex parsing; RGB distance; stock-photo
  domain/watermark flagging; resolution + colour-match ranking.
- Style-code/colour/category matching, the full confidence-scoring engine,
  filename sanitization, column auto-detection, SSRF protection, and the
  real (sharp round-tripped) image-persistence pipeline - all unchanged by
  this pivot, still passing.

**Manual/integration testing (this session, against a running dev server):**
- The generic extraction and page-fetch logic was exercised end-to-end via
  the automated fixture-based tests above (there is no live network access
  in this sandbox to test against further).
- Verified `createSiteAdapter`'s retry-then-throw behavior directly against
  the real, installed `pdfkit`/`cheerio` versions (not just types).
- Ran `npm run smoke:sites -w server -- 50512345 Black "T-Shirt"` and, later,
  a real item from a user's sheet (`npm run smoke:sites -w server --
  50464300 "OPEN BLUE" OUTERWEAR`) end-to-end in this sandbox to confirm the
  script itself (query escalation, per-site fan-out, health-aware error
  handling) runs correctly top-to-bottom.
- Diagnosed *why* every site reports "no candidates" here: this sandbox's
  outbound proxy only allowlists package registries (npmjs, pypi, etc.) and
  Anthropic infra - a direct `curl` to `hugoboss.com` gets a **403 from the
  local sandbox proxy itself** (`CONNECT tunnel failed, response 403`),
  before the request ever reaches the real internet. So the "no candidates"
  result is the sandbox's network policy, not a signal about whether any
  adapter's extraction logic actually works - confirmed by direct `curl`
  testing, not just inference.
- Previously verified in earlier sessions (unaffected by this pivot):
  full import → mapping → confirm flow; manual image upload → approve →
  PDF/ZIP generation (grid layout, category grouping, Season sort verified
  separately when that feature was added); Playwright coverage of Dashboard,
  Import Wizard, Job Detail, Product Review, and the candidate-comparison
  screen at desktop/tablet/mobile viewports.
- **Not yet tested end-to-end: any of the 5 site adapters against the real,
  live internet.** This sandbox has no outbound internet access to arbitrary
  hosts (confirmed directly, see above - only the npm registry and similar
  package-registry infra are reachable), so none of `sites/configs.ts`'s URL
  patterns or the shared extraction/image-fallback heuristics could be
  verified against the actual current markup of hugoboss.com, farfetch.com,
  mrporter.com, selfridges.com, or endclothing.com. **Run
  `npm run smoke:sites -w server -- <styleCode> [colour] [category]`
  from a machine with real internet access before trusting this in
  production** - it prints, per site, how many candidates were found and
  whether a product image was resolved from the first one, so you can
  compare directly against what you see visiting each site yourself.

---

## 7. Known limitations / what still needs verification

- **Every one of the 5 site adapters' URL patterns and HTML-extraction
  heuristics is unverified against the live internet** (see §1b/§6) - this
  is the single biggest thing to check before relying on this in production.
  Expect some adapters to need their `buildSearchUrl` or
  `productUrlPattern` adjusted once run against the real sites; the
  per-site health panel on the Job Detail page and the smoke-test script
  exist specifically to make that easy to spot.
- Direct site search means an honest bot user-agent
  (`ProductImageFinderBot/1.0`, see `lib/httpFetch.ts`) is sent on every
  request - by design, this project does not spoof a browser user-agent to
  evade detection. Some retailers may rate-limit or block a declared bot
  more readily than they would a browser; that shows up as a "failed" site
  in health tracking, not a pipeline crash.
- `xlsx` (SheetJS) has two known npm-registry advisories (prototype
  pollution / ReDoS) with no npm-published fix at the time of writing; the
  maintainers publish patched builds outside npm. Risk is limited here
  because the file is the user's own trusted upload (not arbitrary internet
  content) and upload size is capped (`MAX_UPLOAD_MB`), but this is worth
  revisiting if the app's threat model changes (e.g. exposed as a public
  multi-tenant service accepting anonymous uploads).
- The domain "official brand vs. retailer" trust classification
  (`services/sourceTier.ts`) uses a curated allowlist of well-known
  retailers plus simple heuristics - it does not know your specific brands.
  Extend `RELIABLE_RETAILERS` with your own retailers/brand domains for
  better source-tier scoring.
- Job pause/resume/cancel state lives in-process (a `Map` of running jobs),
  and per-site health counters (§1b) are also in-process/not persisted -
  both reset on a server restart. If the server restarts mid-job, in-flight
  progress already written to the database is preserved, but you'll need to
  click Start again (it will pick up only unprocessed products, not
  re-process approved ones).
- No authentication/multi-user separation - this is a single-operator tool
  as scoped. Add an auth layer before exposing it beyond a trusted network.
- Candidate/product image `<img>` previews for un-downloaded candidates load
  directly from the original source URL in the browser; some sites block
  hotlinking, in which case the thumbnail may not render even though the
  source link and evidence are still correct and Approve will still work.
- **Other decisions worth knowing about:**
  - Category was already a required, existing column before Season was
    added in an earlier session; only Season is actually new. Likewise
    there's a single `Colour` field (name only, e.g. "Black"), not separate
    colour-code/colour-name fields - the PDF swatch is derived directly from
    that name via pdfkit's own colour-name resolver (checked explicitly,
    since pdfkit silently no-ops rather than throwing on a name it doesn't
    recognize - see the `drawColourSwatch` comment in `pdfGenerator.ts`),
    falling back to a neutral grey for compound names it doesn't recognize
    (e.g. "Dark Olive Green").
  - Season sorting within a category group is a plain lexical string sort
    (e.g. `AW24` before `SS24`), not a business-specific chronological
    season calendar - swap in a real comparator if your season codes need
    calendar ordering.
  - The `search_cache` table is keyed by styleCode+colour only (not by
    domain-filter mode) - if you change a job's source-domain restriction
    partway through, a previously-cached `not_found` result computed under
    the old filter is reused as-is. Use "Search Again" on an individual
    product (bypasses cache) if you need to force a re-check after changing
    the filter.
  - `products.search_phase` is now purely informational (which escalating
    attempt - 1, 2, or 3 - produced the current result); there is no more
    job-wide phase barrier. Earlier in this project a daily API quota made
    it worthwhile to finish every item's easy attempt before spending budget
    on anyone's hard attempt; direct site search has no such quota, so each
    item now just escalates through its own attempts independently and as
    fast as the politeness delay allows.

---

## 8. Project structure reference

```
server/src/
  db/                  schema.ts (Drizzle tables), client.ts, migrate.ts
  services/
    fileParser.ts        XLSX/CSV parsing + column auto-detection
    pendingImports.ts     temp-storage for the upload→mapping→confirm flow
    queryBuilder.ts        escalating-attempt query generation per product
    searchProviders/
      types.ts              SearchProvider interface (reused by every adapter)
      createSiteAdapter.ts   shared fetch/retry/bot-check adapter factory
      extractProductCandidates.ts   generic search-results-page link parser
      botCheck.ts            bot-check/CAPTCHA response detection
      politeness.ts          per-domain minimum request delay
      health.ts               per-site success/failure tracking
      index.ts                runSiteSearch: fans a query out to every adapter
      sites/
        configs.ts             the 5 target retailers' search URL builders
        index.ts                builds + exports the 9 SearchProvider adapters
        fixtures/               hand-built sample HTML used by the tests
    robotsCheck.ts / pageFetcher.ts   robots.txt-respecting page fetch + image extraction
    matching.ts / verification.ts / sourceTier.ts   evidence + scoring engine (unchanged)
    productSearch.ts       orchestrates the 3-attempt escalating search for one product
    searchCache.ts         styleCode+colour persistent cache
    queue.ts / jobService.ts   job runner (pause/resume/cancel, no phase/quota governor)
    imageStorage.ts        download/validate/convert/store images
    pdfGenerator.ts         grid-layout category + master PDF generation (pdfkit)
    zipGenerator.ts         ZIP bundling (archiver)
  routes/                 import, jobs, products, export, cache, quickSearch
  lib/                    sanitize.ts, validateUrl.ts (SSRF guard), ids.ts, httpFetch.ts
  scripts/
    smokeTestSites.ts       manual, live smoke test for the 5 site adapters (not run by CI)
web/src/
  pages/                  Dashboard, ImportWizard, JobDetail, ProductReview
  components/             ProductCard, StatCard, ProgressBar, StatusBadge, Navbar
  api/client.ts           typed fetch wrapper for every backend endpoint
```
