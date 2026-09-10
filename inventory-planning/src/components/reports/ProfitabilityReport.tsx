import { useMemo } from "react";
import { useAppStore } from "../../state/appStore";
import { useCategoryTable } from "../../state/useCategoryTable";
import { buildProfitability } from "../../lib/reports";
import { exportToExcel, exportToPdf, fmtMoney, fmtNumber, fmtPct } from "../../lib/exportUtils";

export function ProfitabilityReport() {
  const store = useAppStore();
  const categoryTable = useCategoryTable();

  const rows = useMemo(
    () => buildProfitability(store.inv01Rows, store.sa79Rows, categoryTable, store.scope),
    [store.inv01Rows, store.sa79Rows, categoryTable, store.scope]
  );

  function handleExcel() {
    exportToExcel(
      `profitability_${store.scope}.xlsx`,
      "Profitability",
      [
        { header: "Category", key: "category" },
        { header: "Qty sold", key: "qtySold" },
        { header: "Sale value", key: "saleValue" },
        { header: "Cost value", key: "costValue" },
        { header: "Margin %", key: "marginPct" },
        { header: "Margin value", key: "marginValue" },
        { header: "SOH", key: "soh" },
        { header: "Sell-through %", key: "sellThroughPct" },
      ],
      rows
    );
  }

  function handlePdf() {
    exportToPdf(
      `profitability_${store.scope}.pdf`,
      "Profitability",
      `Scope: ${store.scope}`,
      [
        { header: "Category", key: "category" },
        { header: "Qty sold", key: "qtySold", format: fmtNumber },
        { header: "Margin %", key: "marginPct", format: fmtPct },
        { header: "Margin value", key: "marginValue", format: fmtMoney },
        { header: "Sell-through %", key: "sellThroughPct", format: fmtPct },
      ],
      rows
    );
  }

  return (
    <div className="panel">
      <p className="muted">
        Margin % = (Sell Price − Cost) / Sell Price. Margin Value = (Sell Price − Cost) × Qty Sold. Sell-through % =
        Qty Sold / (Qty Sold + current SOH). Shown side by side — no combined score.
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
              <th>Qty sold</th>
              <th>Sale value</th>
              <th>Cost value</th>
              <th>Margin %</th>
              <th>Margin value</th>
              <th>SOH</th>
              <th>Sell-through %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category}>
                <td>{r.category}</td>
                <td>{fmtNumber(r.qtySold)}</td>
                <td>{fmtMoney(r.saleValue)}</td>
                <td>{fmtMoney(r.costValue)}</td>
                <td>{fmtPct(r.marginPct)}</td>
                <td>{fmtMoney(r.marginValue)}</td>
                <td>{fmtNumber(r.soh)}</td>
                <td>{fmtPct(r.sellThroughPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted">No data found for this view.</p>}
    </div>
  );
}
