import { Fragment, useMemo, useState } from "react";
import { useAppStore } from "../../state/appStore";
import { useCategoryTable } from "../../state/useCategoryTable";
import { useSubCategoryTable } from "../../state/useSubCategoryTable";
import { useReportDate } from "../../state/useReportDate";
import {
  buildRiskFlagging,
  buildRiskSkuDrilldownForSubCategory,
  buildSubCategoryRiskFlagging,
  type RiskTier,
} from "../../lib/reports";
import { FORECAST_METHODS } from "../../types";
import { exportToExcel, exportToPdf, fmtNumber, fmtPct } from "../../lib/exportUtils";

function TierBadge({ tier }: { tier: RiskTier }) {
  const label = tier === "red" ? "🔴 Will run out" : tier === "blue" ? "🔵 Overstock" : "🟢 Healthy";
  return <span className={`badge ${tier}`}>{label}</span>;
}

export function RiskFlaggingReport() {
  const store = useAppStore();
  const categoryTable = useCategoryTable();
  const subCategoryTable = useSubCategoryTable();
  const { reportDate } = useReportDate();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedSubCategory, setExpandedSubCategory] = useState<string | null>(null);

  const rows = useMemo(
    () => buildRiskFlagging(store.inv01Rows, store.sa79Rows, store.orderRows, categoryTable, store.scope, reportDate, store.forecastMethod),
    [store.inv01Rows, store.sa79Rows, store.orderRows, categoryTable, store.scope, reportDate, store.forecastMethod]
  );

  const subRows = useMemo(() => {
    if (!expandedCategory) return [];
    return buildSubCategoryRiskFlagging(
      store.inv01Rows,
      store.sa79Rows,
      store.orderRows,
      categoryTable,
      subCategoryTable,
      store.scope,
      reportDate,
      store.forecastMethod,
      expandedCategory
    );
  }, [expandedCategory, store.inv01Rows, store.sa79Rows, store.orderRows, categoryTable, subCategoryTable, store.scope, reportDate, store.forecastMethod]);

  const drilldown = useMemo(() => {
    if (!expandedCategory) return [];
    if (expandedSubCategory) {
      return buildRiskSkuDrilldownForSubCategory(
        store.inv01Rows,
        store.sa79Rows,
        store.orderRows,
        categoryTable,
        subCategoryTable,
        store.scope,
        reportDate,
        store.forecastMethod,
        expandedCategory,
        expandedSubCategory
      );
    }
    return [];
  }, [
    expandedCategory,
    expandedSubCategory,
    store.inv01Rows,
    store.sa79Rows,
    store.orderRows,
    categoryTable,
    subCategoryTable,
    store.scope,
    reportDate,
    store.forecastMethod,
  ]);

  const methodLabel = FORECAST_METHODS.find((m) => m.id === store.forecastMethod)!.label;

  function toggleCategory(category: string) {
    if (expandedCategory === category) {
      setExpandedCategory(null);
    } else {
      setExpandedCategory(category);
    }
    setExpandedSubCategory(null);
  }

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

  function handleSubExcel() {
    if (!expandedCategory) return;
    exportToExcel(
      `risk_flagging_subcategory_${expandedCategory}_${store.scope}.xlsx`,
      "Sub Category risk",
      [
        { header: "Sub Category", key: "category" },
        { header: "SOH", key: "soh" },
        { header: "Predicted sales", key: "predictedSales" },
        { header: "Coverage %", key: "coveragePct" },
        { header: "Tier", key: "tier" },
      ],
      subRows
    );
  }

  function handleSkuExcel() {
    if (!expandedCategory || !expandedSubCategory) return;
    exportToExcel(
      `risk_flagging_sku_${expandedCategory}_${expandedSubCategory}_${store.scope}.xlsx`,
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
        (overstock). Predicted sales uses the <strong>{methodLabel}</strong> method selected above. Drill into a
        category to see its Sub Categories, then into a Sub Category to see individual SKUs.
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
                    <button className="small" onClick={() => toggleCategory(r.category)}>
                      {expandedCategory === r.category ? "Hide" : "Drill into Sub Categories"}
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
                {expandedCategory === r.category && (
                  <tr>
                    <td colSpan={6} style={{ background: "#fafbfc" }}>
                      <div className="export-row">
                        <span className="muted" style={{ marginRight: "auto" }}>
                          Sub Category detail for {r.category}
                        </span>
                        <button className="small" onClick={handleSubExcel}>
                          Export Sub Category list (Excel)
                        </button>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th></th>
                              <th>Sub Category</th>
                              <th>SOH</th>
                              <th>Predicted sales</th>
                              <th>Coverage %</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subRows.map((sr) => (
                              <Fragment key={sr.category}>
                                <tr>
                                  <td>
                                    <button
                                      className="small"
                                      onClick={() => setExpandedSubCategory(expandedSubCategory === sr.category ? null : sr.category)}
                                    >
                                      {expandedSubCategory === sr.category ? "Hide" : "Drill into SKUs"}
                                    </button>
                                  </td>
                                  <td>{sr.category}</td>
                                  <td>{fmtNumber(sr.soh)}</td>
                                  <td>{fmtNumber(sr.predictedSales)}</td>
                                  <td>{fmtPct(sr.coveragePct)}</td>
                                  <td>
                                    <TierBadge tier={sr.tier} />
                                  </td>
                                </tr>
                                {expandedSubCategory === sr.category && (
                                  <tr>
                                    <td colSpan={6} style={{ background: "#f3f4f6" }}>
                                      <div className="export-row">
                                        <span className="muted" style={{ marginRight: "auto" }}>
                                          SKU-level detail for {r.category} / {sr.category}
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
                        {subRows.length === 0 && <p className="muted">No sub categories found for this category.</p>}
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
