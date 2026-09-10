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
- **Category Study** report (coverage/forecast, 4 selectable methods)
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
   session from whichever of INV01/SA79 you uploaded. Any SKU where the two
   files disagree is flagged as a conflict you must resolve by hand — it's
   never auto-resolved. Any brand-new SKU from "Order on the way" gets its
   `HB_Warehouse_ProdGrp` value pre-filled as a suggestion, but you must
   confirm or override it before it's used in any report. You can download
   your manual decisions as a small Item Code | Category Excel file and load
   it back in a future session to skip re-asking about those SKUs.
4. **View reports**, switching between the 3 individual locations and the
   combined (whole-business) view, and — for Category Study and Risk
   Flagging — between the four forecast methods (with a plain-language
   explanation of each shown in-app). Every report exports to Excel and PDF.

## Assumptions worth knowing about

The brief didn't fully specify a couple of details; these are the
interpretations this build made, called out so they're easy to revisit:

- **SA79's Category column**: the sales file is described as already
  carrying a Category field (used for category resolution) but isn't listed
  among SA79's "key columns" — it's mapped as an optional field.
- **Colour/size on the stock side**: INV01 doesn't have separate Colour/Size
  columns, so the Size/Colour Suggestion % report parses INV01's Reference
  field with the same `Style-ColourCode-Size` pattern used for SA79, and
  resolves the colour code through the same Colour Key file.
- **"Next shipment" for a category/SKU**: the earliest future `Expected
  delivery date` (after any season-level override) among Order-on-the-way
  rows resolving to that category/SKU. "Order on the way" isn't
  location-specific in the brief, so it's treated as whole-business/warehouse
  incoming stock, used the same way regardless of the selected location view.
- **Gap months** (the period a forecast has to cover): every calendar month
  from today's month up to — but excluding — the shipment's month, per the
  brief's own YoY example (today Sep, shipment Nov → Sep+Oct).
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
