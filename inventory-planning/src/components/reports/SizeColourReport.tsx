import { useMemo } from "react";
import { useAppStore } from "../../state/appStore";
import { useCategoryTable } from "../../state/useCategoryTable";
import { buildSizeColourSuggestion } from "../../lib/reports";
import { colourKeyToMap } from "../../lib/parsers";
import { exportToExcel, exportToPdf, fmtPct } from "../../lib/exportUtils";

export function SizeColourReport() {
  const store = useAppStore();
  const categoryTable = useCategoryTable();
  const colourKeyMap = useMemo(() => colourKeyToMap(store.colourKeyEntries), [store.colourKeyEntries]);

  const rows = useMemo(
    () => buildSizeColourSuggestion(store.inv01Rows, store.sa79Rows, categoryTable, colourKeyMap, store.scope),
    [store.inv01Rows, store.sa79Rows, categoryTable, colourKeyMap, store.scope]
  );

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

  return (
    <div className="panel">
      <p className="muted">
        Colour/size on the stock side is extracted from INV01's Reference field using the same
        Style-ColourCode-Size pattern as SA79. Where SOH % is meaningfully lower than Sales %, that size/colour is
        likely under-supplied; where it's meaningfully higher, it's likely over-supplied.
      </p>
      <div className="export-row">
        <button className="secondary" onClick={handleExcel}>
          Export Excel
        </button>
        <button className="secondary" onClick={handlePdf}>
          Export PDF
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Size</th>
              <th>Colour</th>
              <th>Sales Mix %</th>
              <th>SOH Mix %</th>
              <th>Diff (pp)</th>
              <th>Suggestion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.category}</td>
                <td>{r.size}</td>
                <td>{r.colour}</td>
                <td>{fmtPct(r.salesMixPct)}</td>
                <td>{fmtPct(r.sohMixPct)}</td>
                <td>{r.diffPct.toFixed(1)}</td>
                <td>
                  <span
                    className={`badge ${
                      r.suggestion.startsWith("Increase") ? "red" : r.suggestion.startsWith("Decrease") ? "blue" : "green"
                    }`}
                  >
                    {r.suggestion}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted">No size/colour data found for this view.</p>}
    </div>
  );
}
