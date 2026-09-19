# Inventory Planning — Phase 1

A standalone, **client-side only** inventory planning app (like a GitHub
Pages app — no backend, no database). Nothing persists between sessions
unless you explicitly download and re-upload a file. All processing happens
in your browser tab.

This is **Phase 1 of 4**. It delivers:

- File upload + column mapping for INV01, SA79, Order on the way, and the
  Colour Key file
- SKU matching and category resolution (session-only, with an optional
  download/upload of manually-made category decisions)
- **Category Study** report (coverage/forecast, 3 selectable methods)
- **Risk Flagging** report (category-level, with SKU-level drill-down)
- **Size/Colour Suggestion %** report
- **Profitability** report — a flexible SKU-level grouping engine (Category or
  Location), with a Bazaar/clearance toggle
- Per-location and combined (whole-business) views on Category Study, Risk
  Flagging, and Size/Colour Suggestion %
- Excel and PDF export on every report

Reorder/transfer suggestions, Season Profitability & Clearance, aging/markdown,
custom tagging, and forecast-accuracy checks are out of scope for Phase 1 —
they come in later phases.

## Locations

Four selling points: **Boss Boutique — City Centre**, **JDS counter — City
Centre / BCC**, and **JDS counter — Al Aali Mall** are normal, replenished
retail points. **Bazaar** is a clearance/sale-event destination — not
replenished, so it's treated differently everywhere:

- Excluded entirely from Category Study, Risk Flagging, and Size/Colour
  Suggestion % — "combined" on those 3 reports always means the other 3
  locations only, Bazaar never appears there, not even unflagged.
- Only the Profitability report can include it, via an "Include Bazaar"
  toggle that's off by default (so clearance sales never silently distort a
  full-price margin number) and shows "margin including clearance" alongside
  the default "core retail margin" view when turned on.

## Run it

```bash
cd inventory-planning
npm install
npm run dev
```

Open the printed local URL (defaults to `http://localhost:5174`).

```bash
npm run build     # type-checks and produces a static dist/ bundle
npm run typecheck # type-check only
```

`dist/` is a fully static site — it can be hosted anywhere that serves
static files (GitHub Pages included), with no server component.

## How it works

1. **Upload** the four required files. Header rows are auto-located (INV01
   by finding "Item Code"; Order on the way near row 4 by finding "Season" /
   "Expected delivery date"; the Colour Key file near row 3 by finding "Row
   Labels" / "Color name") rather than assumed to be a fixed row, since
   exports can shift columns/rows between runs.
2. **Confirm column mapping.** Every field is auto-detected by header text
   and pre-filled — you confirm or reassign before anything is parsed. For
   INV01's four (Cur Stk, Cur Stk Cost) column pairs, the app also guesses
   which location each pair belongs to from the label text in the row
   directly above the header row (Bazaar's INV01 label differs from its SA79
   Store Name, so it's matched separately from the other 3).
3. **Resolve categories.** The SKU → Category table is rebuilt fresh each
   session from INV01, SA79, *and* Order on the way — all three are equal,
   first-class sources when they carry their own "Category Indecater" column,
   resolved through the same conflict/consensus mechanism. Only INV01's
   Category is required; SA79's and Order's are optional and left unmapped by
   default, since plenty of real exports of either file carry no genuine
   per-SKU category column at all (only a coarser/different grouping) —
   mapping one of those in anyway would flood the conflict list with
   spurious mismatches against INV01's real value. A SKU only one file
   mentions (or where every file that mentions it agrees, ignoring letter
   case — "JERSEY" and "Jersey" are the same value) is trusted
   automatically; a SKU where two or more files disagree on the actual value
   is flagged as a conflict you must resolve by hand — it's never
   auto-resolved. When casing is the only disagreement, the value shown and
   stored everywhere (reports, exports, the trusted-automatically list) is
   always INV01's casing, or SA79's if INV01 doesn't mention that SKU, or
   Order's if neither does. Each
   conflict can be resolved one at a time, or in bulk: pick a source (e.g.
   "Apply INV01's value") and it fills in every conflict currently unresolved
   — optionally narrowed first by a filter box (matches Item Code or any
   candidate value) so you can bulk-apply different rules to different
   subsets rather than only all-or-nothing. A bulk rule never touches a SKU
   you've already decided, individually or via an earlier bulk rule, and the
   full list (resolved and unresolved) stays visible afterward so you can
   spot-check and override any individual SKU at any time — nothing is
   final. **Sub Category** is resolved exactly the same way, one level below Category —
   its own SKU → Sub Category table, its own conflict list, fed by the same
   three files' own "Sub Category" columns — and is never a separate
   top-level filter, only a drill-down from a Category row. You can download
   a full SKU category guideline — every categorized SKU this session
   (Category + Sub Category together, whether trusted automatically or
   resolved by hand), as one Item Code | Category | Sub Category Excel file
   — and load it back in as "previous category decisions" in a future
   session to skip re-asking about all of it, not just what you manually
   resolved. Note that a genuine conflict between the source files
   themselves re-surfaces every session even after loading a previous
   decision — the previous decision only auto-resolves a SKU that no longer
   has a live disagreement in this session's files.
4. **View reports**, switching between the 3 individual locations and the
   combined (whole-business) view, and — for Category Study and Risk
   Flagging — between the three forecast methods (with a plain-language
   explanation of each shown in-app). Every report exports to Excel and PDF.
   Every table's column headers are sortable (click to sort ascending, click
   again for descending — an arrow marks the active column and direction)
   and filterable (a text box under most columns; a dropdown instead for a
   small fixed set of values, like Risk Flagging's tier) — sorting and
   filtering combine freely, and each table (a parent Category table and any
   Sub Category/SKU table drilled into from it) keeps its own independent
   sort/filter state, so narrowing or reordering one never disturbs another
   or blocks drilling in further. Category Study, Risk Flagging, Size/Colour
   Suggestion %, and Profitability (in its Category grouping) all let you
   drill from a Category row into its Sub Categories, computed fresh at that
   level rather than inherited from the parent — Risk Flagging goes one
   level further, from Sub Category into individual SKUs. Each of those 4 reports' Excel export is a single sheet
   using Excel's native row grouping/outline (the same +/- feature
   PivotTables use) — Category rows are always visible, with their Sub
   Category rows (and, for Risk Flagging, SKU rows one level below that)
   nested and collapsed by default. Headers are bold and frozen, every cell
   is bordered, columns are auto-sized, and Risk Flagging's tier column is
   colour-coded to match the on-screen 🔴/🟢/🔵 badges. This needed a second
   Excel library (`exceljs`) alongside the `xlsx` package used for plain
   exports — `xlsx`'s free Community Edition supports writing the row-outline
   feature but silently drops all cell styling (bold, fills, borders) on
   write; only its paid Pro tier supports that, so styled exports use
   `exceljs` (MIT-licensed) instead.

## Assumptions worth knowing about

The brief didn't fully specify a couple of details; these are the
interpretations this build made, called out so they're easy to revisit:

- **SA79's Category column**: the sales file is described as already
  carrying a Category field (used for category resolution) but isn't listed
  among SA79's "key columns" — it's mapped as an optional field. Confirmed
  against a real SA79 export: there's no column actually equivalent to
  INV01's Category, only coarser groupings ("Pur Category", "Sales Category
  Description") that don't share its values — auto-detection deliberately
  never guesses one of those (it would flag nearly every SKU as a category
  conflict against INV01's real value), leaving the field unmapped by
  default until a user opts in explicitly.
- **Colour/size on the stock side**: INV01 doesn't have separate Colour/Size
  columns, so the Size/Colour Suggestion % report parses INV01's Reference
  field with the same `Style-ColourCode-Size` pattern used for SA79, and
  resolves the colour code through the same Colour Key file.
- **"Next shipment" for a category/SKU**: the earliest future `Expected
  delivery date` (after any season-level override) among Order-on-the-way
  rows resolving to that category/SKU. "Order on the way" isn't
  location-specific in the brief, so it's treated as whole-business/warehouse
  incoming stock, used the same way regardless of the selected location view.
- **Report date ("today")**: Category Study and Risk Flagging never use the
  real-world system clock. Every calculation on those two reports — Gap
  months, Average/12, YoY, Trailing 3-month, Coverage, and which
  Order-on-the-way rows even count as a future "next shipment" — is anchored
  to the latest Transaction Date found in the uploaded SA79 file, shown in a
  banner at the top of the Reports screen (e.g. "Report date: 31-Aug-2026").
  A point-in-time sales export must forecast as of when its own data ends,
  not as of whenever someone happens to open the app days or months later.
  If SA79 has no valid Transaction Date at all, the app falls back to the
  system clock and flags this clearly in the banner rather than silently
  guessing.
- **Gap months**: the real calendar distance between the report date and the
  next shipment date, in days, rounded to the nearest whole month (÷30.44) —
  e.g. report date Aug 31 → shipment Oct 31 = 61 days → round(61/30.44) = 2.
  All 3 forecast methods (Average/12, YoY, Trailing 3-month) compute demand
  for this gap period specifically, never a flat full-year figure. A 4th
  method (Seasonality-adjusted) was removed: built from a single year of
  history, it reduces to summing each gap month's share of an annual total
  that was itself derived from those same months — algebraically identical
  to YoY, so it never actually differed from it.
- **Which calendar months YoY sums**: since Gap is now a day-based count
  rather than an explicit list of calendar months, YoY counts back that many
  months from — and including — the shipment's own month (e.g. a 2-month gap
  ending in an Oct 31 shipment uses Sep+Oct, shifted back a year: Sep25–Oct25).
  The shipment's own month is included deliberately: a shipment dated deep
  into its month doesn't cover any of that month's demand, so stock on hand
  has to last through it too. This is the one place in this change with real
  room for a different convention — flag it if a different one was intended.
- **Category Study's Coverage (months)**: `SOH ÷ (Forecast ÷ Gap months)` —
  the forecast is first converted to a monthly demand rate (dividing by how
  many gap months it covers), then SOH is measured against that rate. This
  matters for any gap longer than 1 month: naively dividing SOH by the raw
  multi-month forecast total understates how long stock actually lasts.
  Shown as "X.X months" (one decimal). The YoY column additionally shows
  which actual calendar months it pulled from (e.g. "Sep25–Oct25"), computed
  fresh per row from that row's own gap shifted back a year — two categories
  with different next-shipment dates use different YoY months, so this is
  never a single static label for the whole report.
- **Sell-through %** (Profitability report): Qty Sold ÷ (Qty Sold + current
  SOH), since no explicit "beginning inventory" field exists in the source
  files.
- **"Sales ex-VAT"** (Profitability report): SA79's Sale Value is used as-is —
  the source files carry no separate VAT field or rate to net out.
- **Risk Flagging tiers** use whichever forecast method is selected in the
  shared method picker at the top of the Reports screen (shared with
  Category Study, per the brief).
- **Profitability's Location grouping** shows one row per location plus a
  bold "Combined" row; with Bazaar included it adds a second bold "Combined
  incl. Bazaar" row and Bazaar's own row, so core-retail and
  including-clearance numbers sit side by side rather than silently blending.

## Tested against real production files

Beyond the synthetic sample data used during initial development, this build
was run end-to-end against real INV01, SA79 (56,728 rows / 20MB, spanning
2020–2026), and Colour Key exports. That surfaced several real-world format
quirks synthetic data hadn't — all fixed and re-verified:

- **INV01 grand-total rows**: real exports end with "TOTAL-", "TOTAL
  -ACCESSORIES", "TOTAL-BOSS" summary rows carrying the running total in the
  Item Code column — now filtered out (would otherwise have been counted as
  real SKUs and inflated every report's stock totals).
- **SA79's trailing "Grand Total" row** (no item code) is filtered the same
  way.
- **Colour Key codes are plain numbers** ("2"), not the zero-padded text
  ("002") a Reference field parses out — resolution now strips leading
  zeros from both sides before comparing, rather than assuming a fixed
  padding width (real codes are a mix of 1-, 2-, and 3-digit).
- **A small fraction of References use a different delimiter** —
  `Style ColourCode Size` (space-separated, e.g. `50522704 100 43-46` for a
  size-range pack) instead of the usual `Style-ColourCode-Size` — now
  detected and parsed correctly instead of splitting the size range in half.
- **SA79 store names carry a numeric prefix** (e.g. "001-JNS DEPARTMENT
  STORE - AL AALI MALL"), and the two JDS locations share most of their
  words ("JNS DEPARTMENT STORE"). Location matching now scores every
  location and picks the best match rather than the first one clearing a
  threshold — the earlier approach could misattribute Al Aali Mall's sales
  to BCC.
- **SA79 carries multiple code-like columns** ("Item Code/Line", "User
  Barcode", "Barcode") — only "Item Code/Line" actually matches INV01's Item
  Code format; auto-detection now prefers it by exact phrase instead of
  letting a generic "barcode" alias win on a same-scoring column.

A real "Order on the way" export was tested too (3,062 rows), surfacing more:

- **Its EAN/UPC is a 13-digit code, not the 12-digit Item Code** used by
  INV01/SA79 — specifically, the 12-digit code with a standard EAN-13 check
  digit appended (verified: 100% of the 3,062 real EANs carry a valid
  checksum over their first 12 digits). Left alone, this matched 0 SKUs to
  INV01. The matching-key normalizer now strips a verified check digit
  before comparing — never a blind slice, so a genuinely-13-digit code that
  *doesn't* checksum-match passes through unchanged. That alone took the
  match rate from 0% to 24% (746/3,062) — the shape of a real order book,
  where many lines are new-season styles that were never in current stock
  and correctly land in the "new item" queue.
- **Its true header is split across two rows** for several trailing summary
  columns — a raw SAP export where the field name sits one row above a
  currently-blank (or unit-label, e.g. "EUR") cell on the header row itself.
  Column mapping now borrows from the row above when the header row's own
  cell is blank or looks like a bare currency/percent placeholder, rather
  than falling back to a meaningless "Column N".
- **One of those borrowed header names carries a real typo** — "pending
  Unites QTY" (not "Units") — now tolerated as an explicit alias variant
  rather than failing to auto-map a required field over a single misspelled
  letter upstream.
- **Volume**: 2,316 of the order's 3,062 SKUs were genuinely new (not yet in
  INV01/SA79). Category/Sub Category resolution treats Order on the way as a
  first-class source with its own "Category Indecater"/"Sub Category"
  columns — exactly like INV01/SA79 — so a SKU that's new to INV01/SA79 but
  carries its own category on its Order row resolves automatically, with no
  per-row (or bulk) confirmation step needed. Only a genuine disagreement
  between two or more files' values for the same SKU is ever flagged for a
  human to resolve.
- **Text-formatted dates were silently misparsed.** SheetJS's `cellDates:
  true` only converts genuinely Excel-date-typed cells to JS `Date`s — text-
  formatted date strings (common in these SAP-style exports) pass through as
  raw strings. Both SA79's "Transaction Date" (DD/MM/YYYY, e.g.
  "31/08/2026") and Order-on-the-way's "Expected delivery date" (DD.MM.YYYY,
  e.g. "11.01.2027") are day-first, which JS's native `new Date(string)`
  parsing — US month-first by default — either threw out as `Invalid Date`
  (day > 12) or silently misread with day/month swapped (day ≤ 12). An
  earlier version of this doc claimed SA79's real max Transaction Date was
  2026-12-08 based on this same flawed parsing; that was wrong. With
  day-first parsing applied explicitly before falling back to native
  parsing, SA79's true latest Transaction Date is **2026-08-31**, exactly
  matching the file's own title and header claim.
- **A pending shipment's date could go missing from "Next shipment" entirely**
  (not just lose a min-date comparison to a later one) when that shipment's
  SKU was new to INV01/SA79 and its Order-on-the-way row's suggested category
  was never explicitly confirmed in Step 3 — until confirmed, that SKU's
  category resolved to "(Uncategorized)", so its date was silently excluded
  from its real category's "Next shipment" calculation altogether. Making
  Order a first-class category/sub-category source (this same fix) closes
  the gap: any SKU with its own category value on its Order row resolves
  immediately, with nothing left to forget to confirm.
- **Making Order a first-class category source also, by oversight, made its
  Category column required** — unlike SA79's, which was deliberately left
  optional because real SA79 exports have no genuinely equivalent column.
  Real "Order on the way" exports are often the same: no genuine per-SKU
  category, only a coarser/different grouping (e.g. "HB_Warehouse_ProdGrp").
  With Category required, a user with such a file had no honest mapping to
  give it — mapping that mismatched column in anyway flooded the conflict
  list with hundreds of spurious INV01-vs-Order disagreements, and bulk-
  resolving them (by any rule) could scatter real SA79 sales history away
  from a SKU's true category into whatever the mismatched column produced,
  making every category's forecast — not just one — read as zero or near-
  zero despite real stock and real sales existing somewhere in the file.
  Order's Category (and Sub Category) are now optional and unmapped by
  default, exactly like SA79's, so a file that lacks the column simply
  doesn't contribute to category resolution instead of forcing a bad guess.

With those fixes, all four real files loaded and processed correctly
end-to-end (SA79's 20MB upload took ~19s to parse in-browser) with sensible
results: e.g. only ~4.9% of SA79's 26,162 historical SKUs matched current
INV01 stock (INV01 is a point-in-time snapshot; SA79 covers 6+ years, so
most historically-sold SKUs are long since discontinued/sold through) —
surfaced transparently via the match-count summary and an "(Uncategorized)"
bucket in the reports rather than silently dropped or misattributed. Bazaar's
real numbers came back with a genuinely negative margin (clearance sold
below cost), which is exactly the kind of thing the core-retail-vs-including-
clearance split in Profitability is meant to surface rather than hide. One
thing worth knowing going in: because current-stock SOH and matched-sales
history don't fully overlap (that same 4.9% match), Average/12 Coverage
(months) can look extreme for a category where matched sales history is thin
relative to its real stock — the number is arithmetically correct given
what's matched, not a bug, but worth cross-checking against another forecast
method (or against real intuition) before acting on an outlier.
