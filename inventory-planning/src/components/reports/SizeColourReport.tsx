import { Fragment, useMemo, useState } from "react";
import { useAppStore } from "../../state/appStore";
import { useCategoryTable } from "../../state/useCategoryTable";
import { useSubCategoryTable } from "../../state/useSubCategoryTable";
import { buildSizeColourSuggestion, buildSubCategorySizeColourSuggestion, type SizeColourRow } from "../../lib/reports";
import { colourKeyToMap } from "../../lib/parsers";
import { exportToExcel, exportToPdf, fmtPct } from "../../lib/exportUtils";

function groupByLabel(rows: SizeColourRow[]): [string, SizeColourRow[]][] {
  const map = new Map<string, SizeColourRow[]>();
  for (const r of rows) {
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category)!.push(r);
  }
  return [...map.entries()];
}

function SizeColourTableBody({ rows }: { rows: SizeColourRow[] }) {
  return (
    <tbody>
      {rows.map((r, i) => (
        <tr key={i}>
          <td>{r.size}</td>
          <td>{r.colour}</td>
          <td>{fmtPct(r.salesMixPct)}</td>
          <td>{fmtPct(r.sohMixPct)}</td>
          <td>{r.diffPct.toFixed(1)}</td>
          <td>
            <span
              className={`badge ${r.suggestion.startsWith("Increase") ? "red" : r.suggestion.startsWith("Decrease") ? "blue" : "green"}`}
            >
              {r.suggestion}
            </span>
          </td>
        </tr>
      ))}
    </tbody>
  );
}

export function SizeColourReport() {
  const store = useAppStore();
  const categoryTable = useCategoryTable();
  const subCategoryTable = useSubCategoryTable();
  const colourKeyMap = useMemo(() => colourKeyToMap(store.colourKeyEntries), [store.colourKeyEntries]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(
    () => buildSizeColourSuggestion(store.inv01Rows, store.sa79Rows, categoryTable, colourKeyMap, store.scope),
    [store.inv01Rows, store.sa79Rows, categoryTable, colourKeyMap, store.scope]
  );

  const grouped = useMemo(() => groupByLabel(rows), [rows]);

  const subRows = useMemo(() => {
    if (!expanded) return [];
    return buildSubCategorySizeColourSuggestion(store.inv01Rows, store.sa79Rows, categoryTable, subCategoryTable, colourKeyMap, store.scope, expanded);
  }, [expanded, store.inv01Rows, store.sa79Rows, categoryTable, subCategoryTable, colourKeyMap, store.scope]);

  const subGrouped = useMemo(() => groupByLabel(subRows), [subRows]);

  function handleExcel() {
    exportToExcel(
      `size_colour_suggestion_${store.scope}.xlsx`,
      "Size Colour %",
      [
        { header: "Category", key: "category" },
        { header: "Size", key: "size" },
        { header: "Colour", key: "colour" },
        { header: "Sales Mix %", key: "salesMixPct" },
        { header: "SOH Mix %", key: "sohMixPct" },
        { header: "Diff (pp)", key: "diffPct" },
        { header: "Suggestion", key: "suggestion" },
      ],
      rows
    );
  }

  function handlePdf() {
    exportToPdf(
      `size_colour_suggestion_${store.scope}.pdf`,
      "Size/Colour Suggestion %",
      `Scope: ${store.scope}`,
      [
        { header: "Category", key: "category" },
        { header: "Size", key: "size" },
        { header: "Colour", key: "colour" },
        { header: "Sales Mix %", key: "salesMixPct", format: fmtPct },
        { header: "SOH Mix %", key: "sohMixPct", format: fmtPct },
        { header: "Suggestion", key: "suggestion" },
      ],
      rows
    );
  }

  function handleSubExcel() {
    if (!expanded) return;
    exportToExcel(
      `size_colour_suggestion_${expanded}_subcategories_${store.scope}.xlsx`,
      "Sub Category Size Colour %",
      [
        { header: "Sub Category", key: "category" },
        { header: "Size", key: "size" },
        { header: "Colour", key: "colour" },
        { header: "Sales Mix %", key: "salesMixPct" },
        { header: "SOH Mix %", key: "sohMixPct" },
        { header: "Diff (pp)", key: "diffPct" },
        { header: "Suggestion", key: "suggestion" },
      ],
      subRows
    );
  }

  return (
    <div className="panel">
      <p className="muted">
        Colour/size on the stock side is extracted from INV01's Reference field using the same
        Style-ColourCode-Size pattern as SA79. Where SOH % is meaningfully lower than Sales %, that size/colour is
        likely under-supplied; where it's meaningfully higher, it's likely over-supplied. Drill into a category to
        see the same comparison broken out by Sub Category.
      </p>
      <div className="export-row">
        <button className="secondary" onClick={handleExcel}>
          Export Excel
        </button>
        <button className="secondary" onClick={handlePdf}>
          Export PDF
        </button>
      </div>
      {grouped.map(([category, catRows]) => (
        <Fragment key={category}>
          <div className="export-row" style={{ marginTop: 14, marginBottom: 4 }}>
            <strong style={{ marginRight: "auto" }}>{category}</strong>
            <button className="small" onClick={() => setExpanded(expanded === category ? null : category)}>
              {expanded === category ? "Hide Sub Categories" : "Drill into Sub Categories"}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Colour</th>
                  <th>Sales Mix %</th>
                  <th>SOH Mix %</th>
                  <th>Diff (pp)</th>
                  <th>Suggestion</th>
                </tr>
              </thead>
              <SizeColourTableBody rows={catRows} />
            </table>
          </div>
          {expanded === category && (
            <div style={{ background: "#fafbfc", padding: 10, marginBottom: 10 }}>
              <div className="export-row">
                <span className="muted" style={{ marginRight: "auto" }}>
                  Sub Category detail for {category}
                </span>
                <button className="small" onClick={handleSubExcel}>
                  Export Sub Category list (Excel)
                </button>
              </div>
              {subGrouped.map(([subCategory, subCatRows]) => (
                <Fragment key={subCategory}>
                  <div style={{ marginTop: 10, marginBottom: 4, fontSize: 13, fontWeight: 600 }}>{subCategory}</div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Size</th>
                          <th>Colour</th>
                          <th>Sales Mix %</th>
                          <th>SOH Mix %</th>
                          <th>Diff (pp)</th>
                          <th>Suggestion</th>
                        </tr>
                      </thead>
                      <SizeColourTableBody rows={subCatRows} />
                    </table>
                  </div>
                </Fragment>
              ))}
              {subGrouped.length === 0 && <p className="muted">No sub categories found for this category.</p>}
            </div>
          )}
        </Fragment>
      ))}
      {rows.length === 0 && <p className="muted">No size/colour data found for this view.</p>}
    </div>
  );
}
