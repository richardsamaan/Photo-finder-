import { useMemo, useState } from "react";
import { useAppStore } from "../state/appStore";
import { MappingTable, unmappedRequired } from "./MappingTable";
import { StockPairMapping } from "./StockPairMapping";
import { COLOUR_KEY_FIELDS, INV01_FIELDS, ORDER_FIELDS, SA79_FIELDS } from "../lib/columnMapping";
import { colourKeyToMap, parseColourKey, parseInv01, parseOrderOnTheWay, parseSa79 } from "../lib/parsers";
import { toText } from "../lib/sheetLoad";
import { computeMatchSummary } from "../lib/matching";
import { normalizeMatchingKey } from "../lib/matchingKey";
import type { LocationId } from "../types";

export function MappingStep() {
  const store = useAppStore();
  const [error, setError] = useState<string | null>(null);

  const inv01 = store.inv01File!;
  const sa79 = store.sa79File!;
  const order = store.orderFile!;
  const colourKey = store.colourKeyFile!;

  const seasons = useMemo(() => {
    const header = order.mapping.season;
    if (!header) return [];
    const set = new Set<string>();
    for (const row of order.preview.rows) {
      const v = toText(row[header]);
      if (v) set.add(v);
    }
    return [...set].sort();
  }, [order.mapping.season, order.preview.rows]);

  const missing = [
    ...unmappedRequired(INV01_FIELDS, inv01.mapping).map((f) => `INV01: ${f}`),
    ...unmappedRequired(SA79_FIELDS, sa79.mapping).map((f) => `SA79: ${f}`),
    ...unmappedRequired(ORDER_FIELDS, order.mapping).map((f) => `Order on the way: ${f}`),
    ...unmappedRequired(COLOUR_KEY_FIELDS, colourKey.mapping).map((f) => `Colour Key: ${f}`),
  ];

  function parseAll() {
    setError(null);
    try {
      const colourKeyEntries = parseColourKey(colourKey.preview, colourKey.mapping);
      const colourMap = colourKeyToMap(colourKeyEntries);

      const stockPairs = inv01.stockPairs.map((pair) => ({
        pair,
        location: inv01.pairLocationOverride[pair.columnIndex] as LocationId | null,
      }));
      const inv01Rows = parseInv01(inv01.preview, inv01.mapping, stockPairs);

      const sa79Rows = parseSa79(sa79.preview, sa79.mapping, colourMap);

      const seasonDateOverrideDates: Record<string, Date | null> = {};
      for (const [season, val] of Object.entries(store.seasonDateOverrides)) {
        seasonDateOverrideDates[season] = val ? new Date(val) : null;
      }
      const orderRows = parseOrderOnTheWay(order.preview, order.mapping, seasonDateOverrideDates);

      store.setParsed({ inv01: inv01Rows, sa79: sa79Rows, orders: orderRows, colourKey: colourKeyEntries });
      store.setStep("categories");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const inv01Skus = new Set(inv01.preview.rows.map((r) => normalizeMatchingKey(toText(r[inv01.mapping.itemCode ?? ""]))).filter(Boolean));
  const sa79Skus = sa79.preview.rows.map((r) => normalizeMatchingKey(toText(r[sa79.mapping.itemCode ?? ""]))).filter(Boolean);
  const orderSkus = order.preview.rows
    .map((r) => normalizeMatchingKey(toText(r[order.mapping.ean ?? ""]) || toText(r[order.mapping.line ?? ""])))
    .filter(Boolean);
  const sa79Match = computeMatchSummary("SA79 vs INV01", sa79Skus, inv01Skus);
  const orderMatch = computeMatchSummary("Order on the way vs INV01", orderSkus, inv01Skus);

  return (
    <div className="panel">
      <h2>Step 2 — Confirm column mapping</h2>
      <p>Auto-detected mapping is pre-filled below. Confirm or reassign any field before continuing.</p>
      {error && <div className="warn-box">{error}</div>}

      <details open>
        <summary><strong>INV01 (stock)</strong></summary>
        <MappingTable fields={INV01_FIELDS} headers={inv01.preview.headers} mapping={inv01.mapping} onChange={(k, h) => store.updateInv01Mapping({ ...inv01.mapping, [k]: h })} />
        <h4 style={{ marginTop: 14 }}>Per-location stock columns</h4>
        <StockPairMapping pairs={inv01.stockPairs} override={inv01.pairLocationOverride} onChange={store.setInv01PairLocation} />
      </details>

      <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--border)" }} />

      <details open>
        <summary><strong>SA79 (sales)</strong></summary>
        <MappingTable fields={SA79_FIELDS} headers={sa79.preview.headers} mapping={sa79.mapping} onChange={(k, h) => store.updateSa79Mapping({ ...sa79.mapping, [k]: h })} />
      </details>

      <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--border)" }} />

      <details open>
        <summary><strong>Order on the way</strong></summary>
        <MappingTable fields={ORDER_FIELDS} headers={order.preview.headers} mapping={order.mapping} onChange={(k, h) => store.updateOrderMapping({ ...order.mapping, [k]: h })} />
        {seasons.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h4>Season-level date override (optional)</h4>
            <p className="muted">
              Set a single date for a whole season to replace every row's individual Expected delivery date for that
              season only. Leave blank to use each row's own date.
            </p>
            {seasons.map((s) => (
              <div className="field-row" key={s}>
                <label>{s}</label>
                <input
                  type="date"
                  value={store.seasonDateOverrides[s] ?? ""}
                  onChange={(e) => store.setSeasonDateOverride(s, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}
      </details>

      <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--border)" }} />

      <details open>
        <summary><strong>Colour Key file</strong></summary>
        <MappingTable fields={COLOUR_KEY_FIELDS} headers={colourKey.preview.headers} mapping={colourKey.mapping} onChange={(k, h) => store.updateColourKeyMapping({ ...colourKey.mapping, [k]: h })} />
      </details>

      <div className="match-summary">
        {sa79Match.matched} of {sa79Match.totalInSource} SA79 SKUs matched to INV01, {sa79Match.unmatched} unmatched.
        <br />
        {orderMatch.matched} of {orderMatch.totalInSource} Order-on-the-way SKUs matched to INV01, {orderMatch.unmatched}{" "}
        unmatched (unmatched ones are new items — you'll confirm a category for them next).
      </div>

      {missing.length > 0 && (
        <div className="warn-box">
          Missing required mapping(s): {missing.join(", ")}
        </div>
      )}

      <div className="actions-row">
        <button className="secondary" onClick={() => store.setStep("upload")}>
          ← Back
        </button>
        <button className="primary" disabled={missing.length > 0} onClick={parseAll}>
          Confirm & continue to category resolution →
        </button>
      </div>
    </div>
  );
}
