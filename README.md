# Product Image Finder & Catalog Generator

A production web app that takes an uploaded product list (Style Code, Colour,
Category), searches the real internet for each exact product, verifies the
match with evidence (not visual guessing), lets a human review/approve every
image, then generates category-organized image folders, per-category PDFs, a
master catalog PDF, and a downloadable ZIP.

**No fake data. No simulated search.** When no search-provider API key is
configured, the app tells you so explicitly and blocks the search step
instead of inventing results.

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
- **Search provider**: a `SearchProvider` interface
  (`server/src/services/searchProviders/types.ts`) with four adapters -
  Google Custom Search JSON API, Firecrawl, SerpAPI, Bing Web Search - all
  implementing the same `search(query)` contract. Swapping providers is a
  one-line env var change (`SEARCH_PROVIDER`); adding a new one means
  implementing the interface and registering it in `searchProviders/index.ts`.
  No provider is hard-selected in code.

---

## 2. How the matching/verification logic works (Phases 3-5)

1. **Query generation** (`services/queryBuilder.ts`): for each product, up to
   6 queries are generated, most-specific first (e.g. `"50512345" "Black"`,
   `50512345 Black`, `"50512345" product`, `50512345 T-Shirt`, `50512345`).
2. **Search**: each query is run through the active provider with a shared
   rate limiter and retry-with-backoff (`searchProviders/index.ts`).
   Duplicate URLs across queries are de-duplicated.
3. **Page verification** (`services/pageFetcher.ts` + `robotsCheck.ts`): for
   each candidate URL (top 8), the app checks `robots.txt` before fetching.
   If the active provider offers a scrape API (Firecrawl), that's used;
   otherwise a direct HTTP GET + HTML text/meta/image extraction
   (`cheerio`) is done. Disallowed pages are never fetched - they're scored
   from the search snippet only.
4. **Evidence scoring** (`services/verification.ts` + `matching.ts`): the
   style code is checked as a real token match (word-boundary and
   separator-tolerant, e.g. `5051-2345` still matches `50512345`) - **never**
   a substring match that could hit inside an unrelated longer number.
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
   visual similarity" requirement.
6. Nothing is ever auto-approved. The best candidate becomes the product's
   suggested image/status; a human must explicitly Approve, Reject, pick a
   different candidate, or upload their own image before it's downloaded.

Unit tests for all of this logic live in `server/src/services/*.test.ts` and
`server/src/lib/*.test.ts` (31 tests, see §6).

---

## 3. Setup

### Prerequisites
- Node.js ≥ 20
- npm

### Install

```bash
git clone <this-repo>
cd Photo-finder-
cp .env.example .env      # then edit .env - see §4
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

Copy `.env.example` to `.env`. Full reference:

| Variable | Required | Description |
|---|---|---|
| `PORT` | no (default 4000) | API server port |
| `DATABASE_PATH` | no | SQLite file path (relative to repo root) |
| `STORAGE_DIR` | no | Where uploads/images/PDFs/ZIPs are written |
| `CORS_ORIGIN` | no | Allowed frontend origin |
| `SEARCH_PROVIDER` | **yes, for real search** | `google_cse` \| `firecrawl` \| `serpapi` \| `bing` \| `none` |
| `GOOGLE_API_KEY` / `GOOGLE_CSE_ID` | if using `google_cse` | [Google Programmable Search](https://developers.google.com/custom-search/v1/overview) - free tier: 100 queries/day |
| `FIRECRAWL_API_KEY` | if using `firecrawl` | [firecrawl.dev](https://www.firecrawl.dev/) - search **and** page-scrape in one provider (recommended: best verification quality since it can read full page content, not just snippets) |
| `SERPAPI_API_KEY` | if using `serpapi` | [serpapi.com](https://serpapi.com/) |
| `BING_API_KEY` | if using `bing` | Azure Cognitive Services Bing Web Search |
| `SEARCH_CONCURRENCY` | no (default 3) | Parallel products processed at once |
| `SEARCH_RATE_LIMIT_MS` | no (default 600) | Minimum gap between provider HTTP calls |
| `SEARCH_MAX_RETRIES` | no (default 2) | Retries per query on provider error |
| `MAX_UPLOAD_MB` / `MAX_IMAGE_MB` | no | Upload size limits |

**With `SEARCH_PROVIDER=none` (the default), the app runs fully and
honestly - import, review UI, manual image upload, PDF/ZIP export all work -
but clicking "Start Search" returns a clear
"Search provider not configured" message instead of any result.**

To enable real search, pick **one** provider, get its API key, set
`SEARCH_PROVIDER` and the matching key(s) above.

---

## 5. How to use it

1. **Upload** an `.xlsx`, `.xls`, or `.csv` file with Style Code, Colour, and
   Category columns (common header variants like `SKU`, `Color`, `Product
   Type` are auto-detected).
2. **Map columns** - auto-detected mapping is pre-filled; change any dropdown
   if needed. A live preview table and Total Products / Total Categories
   counters update as you adjust the mapping.
3. **Confirm Import** (or Cancel) - creates the job and every product row.
4. On the **Job Detail** page: **Start Search** (requires a configured
   provider), or **Pause / Resume / Cancel / Retry Failed / Search Selected**
   while it runs. Live stats (Total, Images Found, High/Medium Confidence,
   Needs Review, Not Found, Approved, Rejected, Failed, Pending) and a
   progress bar update automatically.
5. Open any product to **Review**: see the image, evidence notes, confidence,
   source. **Approve** downloads and stores the image; **Reject** discards
   it; **Search Again** re-runs the pipeline (bypassing cache); **Find
   Another Image** shows every candidate side-by-side with its own evidence
   badges so you can manually pick a different one; **Upload Image** lets you
   supply your own file when nothing found online is right.
6. Back on the Job Detail page, **Generate PDFs** builds every category PDF
   plus the master `Product_Image_Catalog.pdf`; **Generate ZIP** bundles the
   full `Product_Catalog/` folder (images + PDFs) into `Product_Catalog.zip`.
   Download links appear immediately after generation.

---

## 6. Testing performed

**Automated (31 passing tests, `npm test -w server`):**
- Style-code matching: exact tokens, separator-tolerant matches (`5051-2345`
  vs `50512345`), and rejection of substrings inside unrelated longer numbers.
- Colour matching + spelling synonyms (grey/gray) + conflicting-colour
  detection.
- Category matching with plural/synonym tolerance.
- Full confidence-scoring engine: exact match → high confidence; wrong style
  code → hard-capped low regardless of everything else; right code + wrong
  stated colour → strongly penalized; ranking always prefers a style-code
  match over a higher-scoring non-match.
- Filename sanitization (`STYLECODE-COLOUR.jpg`, special-character and
  path-traversal stripping).
- Column auto-detection across header aliases (`SKU`, `Color`, `Product
  Type`, etc.) and correct "not confident" fallback.
- SSRF protection: rejects localhost/loopback/RFC1918/link-local URLs and
  non-http(s) schemes before any download is attempted.
- Real image pipeline: `persistImageBuffer` writes an actual JPEG to
  `Product_Catalog/<Category>/STYLECODE-COLOUR.jpg`, round-tripped through
  `sharp` to confirm it decodes correctly.

**Manual/integration (performed live against the running app this session):**
- Uploaded a real 5-product CSV (T-Shirt/Shirt/Trousers/Jacket categories) →
  column auto-detection → live preview → confirm → job + 4 categories + 5
  products created correctly.
- Verified `POST /jobs/:id/start` is correctly blocked with a clear error
  when no search provider is configured (this sandbox has no API key and no
  outbound access to arbitrary internet hosts - see §7).
- Manually uploaded a real image per product (via the actual Upload Image
  endpoint/UI) → confirmed `STYLECODE-COLOUR.jpg` filenames, correct
  `Product_Catalog/<Category>/` folder placement, dashboard stats updated.
- Generated real PDFs and a real ZIP via the live API and downloaded them:
  master PDF (10 pages: cover + 4 category dividers + 5 product pages),
  T-Shirt category PDF (3 pages), ZIP with the exact
  `Product_Catalog/<Category>/{images, Category.pdf}` +
  `Product_Catalog/Product_Image_Catalog.pdf` structure - verified with
  `unzip -l` and `file`.
- Browser testing (Playwright + the pre-installed Chromium) at desktop
  (1440×900), Galaxy S24 Ultra (412×915), and tablet (820×1180) viewports:
  Dashboard, Import Wizard (full upload → map → preview → confirm flow
  driven end-to-end), Job Detail (stats grid, filters, controls,
  enabled/disabled button states verified programmatically), Product Review
  (approve/reject/upload flow driven end-to-end, status updates live),
  and the candidate-comparison "Find Another Image" screen (seeded
  representative candidates to confirm the exact-match-vs-similar-looking
  UI renders evidence badges and confidence correctly).
- Bug found and fixed during this testing: PDF cover-page generation crashed
  on `autoFirstPage:false` documents; product image path had a duplicated
  `catalog/` segment; picking a new candidate or re-searching didn't
  invalidate a previously-approved local image. All three fixed and
  re-verified live.

---

## 7. Known limitations / what still needs configuration

- **A live search-provider API key is required for Phase 3-5 (actual
  internet search) to run.** None is configured out of the box - see §4.
  This sandbox environment also has no outbound network access to arbitrary
  internet hosts (only the npm registry is reachable through its proxy), so
  the provider adapters' live HTTP calls could not be exercised end-to-end
  in this session. Their request/response handling was written against each
  provider's documented API shape and is otherwise fully wired in; you
  should do one small real search (5-10 products) after adding a key, per
  the Stop Conditions in the original brief, before running a large import.
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
- Job pause/resume/cancel state lives in-process (a `Map` of running jobs).
  If the server process restarts mid-job, in-flight progress already written
  to the database is preserved, but you'll need to click Start again (it
  will pick up only unprocessed products, not re-process approved ones).
- No authentication/multi-user separation - this is a single-operator tool
  as scoped. Add an auth layer before exposing it beyond a trusted network.
- Candidate/product image `<img>` previews for un-downloaded candidates load
  directly from the original source URL in the browser; some sites block
  hotlinking, in which case the thumbnail may not render even though the
  source link and evidence are still correct and Approve will still work.

---

## 8. Project structure reference

```
server/src/
  db/                  schema.ts (Drizzle tables), client.ts, migrate.ts
  services/
    fileParser.ts        XLSX/CSV parsing + column auto-detection
    pendingImports.ts     temp-storage for the upload→mapping→confirm flow
    queryBuilder.ts        multi-query generation per product
    searchProviders/       pluggable provider interface + 4 adapters
    robotsCheck.ts / pageFetcher.ts   robots.txt-respecting page fetch
    matching.ts / verification.ts / sourceTier.ts   evidence + scoring engine
    productSearch.ts       orchestrates search→fetch→score for one product
    searchCache.ts         styleCode+colour persistent cache
    queue.ts / jobService.ts   concurrency-limited job runner
    imageStorage.ts        download/validate/convert/store images
    pdfGenerator.ts         category + master PDF generation (pdfkit)
    zipGenerator.ts         ZIP bundling (archiver)
  routes/                 import, jobs, products, export, cache
  lib/                    sanitize.ts, validateUrl.ts (SSRF guard), ids.ts, httpFetch.ts
web/src/
  pages/                  Dashboard, ImportWizard, JobDetail, ProductReview
  components/             ProductCard, StatCard, ProgressBar, StatusBadge, Navbar
  api/client.ts           typed fetch wrapper for every backend endpoint
```
