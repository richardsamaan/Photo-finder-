import { Fragment, useMemo, useState } from "react";
import { useAppStore } from "../../state/appStore";
import { useCategoryTable } from "../../state/useCategoryTable";
import { useReportDate } from "../../state/useReportDate";
import { buildRiskFlagging, buildRiskSkuDrilldown, type RiskTier } from "../../lib/reports";
import { FORECAST_METHODS } from "../../types";
import { exportToExcel, exportToPdf, fmtNumber, fmtPct } from "../../lib/exportUtils";

function TierBadge({ tier }: { tier: RiskTier }) {
  const label = tier === "red" ? "🔴 Will run out" : tier === "blue" ? "🔵 Overstock" : "🟢 Healthy";
  return <span className={`badge ${tier}`}>{label}</span>;
}

export function RiskFlaggingReport() {
  const store = useAppStore();
  const categoryTable = useCategoryTable();
  const { reportDate } = useReportDate();
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(
    () => buildRiskFlagging(store.inv01Rows, store.sa79Rows, store.orderRows, categoryTable, store.scope, reportDate, store.forecastMethod),
    [store.inv01Rows, store.sa79Rows, store.orderRows, categoryTable, store.scope, reportDate, store.forecastMethod]
  );

  const drilldown = useMemo(() => {
    if (!expanded) return [];
    return buildRiskSkuDrilldown(store.inv01Rows, store.sa79Rows, store.orderRows, categoryTable, store.scope, reportDate, store.forecastMethod, expanded);
  }, [expanded, store.inv01Rows, store.sa79Rows, store.orderRows, categoryTable, store.scope, reportDate, store.forecastMethod]);

  const methodLabel = FORECAST_METHODS.find((m) => m.id === store.forecastMethod)!.label;

  function handleExcel() {
    exportToExcel(
      `risk_flagging_${store.scope}.xlsx`,
      "Risk Flagging",
      [
        { header: "Category", key: "category" },
        { header: "SOH", key: "soh" },
        { header: "Predicted sales", key: "predictedSales" },
        { header: "Coverage %", key: "coveragePct" },
        { header: "Tier", key: "tier" },
      ],
      rows.map((r) => ({ ...r, coveragePct: r.coveragePct }))
    );
  }

  function handlePdf() {
    exportToPdf(
      `risk_flagging_${store.scope}.pdf`,
      "Risk Flagging — Category overview",
      `Scope: ${store.scope} — Method: ${methodLabel}`,
      [
        { header: "Category", key: "category" },
        { header: "SOH", key: "soh", format: fmtNumber },
        { header: "Predicted sales", key: "predictedSales", format: fmtNumber },
        { header: "Coverage %", key: "coveragePct", format: fmtPct },
        { header: "Tier", key: "tier" },
      ],
      rows
    );
  }

  function handleSkuExcel() {
    if (!expanded) return;
    exportToExcel(
      `risk_flagging_sku_${expanded}_${store.scope}.xlsx`,
      "SKU drilldown",
      [
        { header: "Item Code", key: "itemCode" },
        { header: "Description", key: "itemDesc" },
        { header: "SOH", key: "soh" },
        { header: "Predicted sales", key: "predictedSales" },
        { header: "Coverage %", key: "coveragePct" },
        { header: "Tier", key: "tier" },
      ],
      drilldown
    );
  }

  return (
    <div className="panel">
      <p className="muted">
        🔴 Red: SOH &lt; 95% of predicted sales until next shipment. 🟢 Green: 95%–105% (healthy). 🔵 Blue: &gt;105%
        (overstock). Predicted sales uses the <strong>{methodLabel}</strong> method selected above.
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
              <th></th>
              <th>Category</th>
              <th>SOH</th>
              <th>Predicted sales</th>
              <th>Coverage %</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.category}>
                <tr>
                  <td>
                    <button className="small" onClick={() => setExpanded(expanded === r.category ? null : r.category)}>
                      {expanded === r.category ? "Hide SKUs" : "Drill into SKUs"}
                    </button>
                  </td>
                  <td>{r.category}</td>
                  <td>{fmtNumber(r.soh)}</td>
                  <td>{fmtNumber(r.predictedSales)}</td>
                  <td>{fmtPct(r.coveragePct)}</td>
                  <td>
                    <TierBadge tier={r.tier} />
                  </td>
                </tr>
                {expanded === r.category && (
                  <tr>
                    <td colSpan={6} style={{ background: "#fafbfc" }}>
                      <div className="export-row">
                        <span className="muted" style={{ marginRight: "auto" }}>
                          SKU-level detail for {r.category}
                        </span>
                        <button className="small" onClick={handleSkuExcel}>
                          Export SKU list (Excel)
                        </button>
                      </div>
                      <div className="table-wrap" style={{ maxHeight: 320 }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Item Code</th>
                              <th>Description</th>
                              <th>SOH</th>
                              <th>Predicted sales</th>
                              <th>Coverage %</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drilldown.map((d) => (
                              <tr key={d.itemCode}>
                                <td>{d.itemCode}</td>
                                <td>{d.itemDesc}</td>
                                <td>{fmtNumber(d.soh)}</td>
                                <td>{fmtNumber(d.predictedSales)}</td>
                                <td>{fmtPct(d.coveragePct)}</td>
                                <td>
                                  <TierBadge tier={d.tier} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
