import { Fragment, useMemo, useState } from "react";
import { useAppStore } from "../../state/appStore";
import { useCategoryTable } from "../../state/useCategoryTable";
import { useSubCategoryTable } from "../../state/useSubCategoryTable";
import { useReportDate } from "../../state/useReportDate";
import {
  buildRiskFlagging,
  buildRiskSkuDrilldownForSubCategory,
  buildSubCategoryRiskFlagging,
  type RiskRow,
  type RiskSkuRow,
  type RiskTier,
} from "../../lib/reports";
import { FORECAST_METHODS } from "../../types";
import { exportToPdf, fmtNumber, fmtPct } from "../../lib/exportUtils";
import { exportGroupedExcel, type GroupedExportColumn, type GroupedExportRow } from "../../lib/groupedExcelExport";

function tierLabel(tier: RiskTier): string {
  return tier === "red" ? "🔴 Will run out" : tier === "blue" ? "🔵 Overstock" : "🟢 Healthy";
}

function TierBadge({ tier }: { tier: RiskTier }) {
  return <span className={`badge ${tier}`}>{tierLabel(tier)}</span>;
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

  function riskRowCells(r: RiskRow): Record<string, unknown> {
    return { label: r.category, soh: r.soh, predictedSales: r.predictedSales, coveragePct: r.coveragePct, status: tierLabel(r.tier) };
  }

  function skuRowCells(d: RiskSkuRow): Record<string, unknown> {
    return {
      label: "",
      itemCode: d.itemCode,
      itemDesc: d.itemDesc,
      soh: d.soh,
      predictedSales: d.predictedSales,
      coveragePct: d.coveragePct,
      status: tierLabel(d.tier),
    };
  }

  async function handleExcel() {
    const columns: GroupedExportColumn[] = [
      { header: "Category / Sub Category", key: "label", width: 26 },
      { header: "Item Code", key: "itemCode" },
      { header: "Description", key: "itemDesc", width: 24 },
      { header: "SOH", key: "soh" },
      { header: "Predicted sales", key: "predictedSales", numFmt: "0.0" },
      { header: "Coverage %", key: "coveragePct", numFmt: "0.0" },
      { header: "Status", key: "status" },
    ];
    const groupedRows: GroupedExportRow[] = [];
    for (const r of rows) {
      groupedRows.push({ cells: riskRowCells(r), level: 0, tier: r.tier });
      const subRisk = buildSubCategoryRiskFlagging(
        store.inv01Rows,
        store.sa79Rows,
        store.orderRows,
        categoryTable,
        subCategoryTable,
        store.scope,
        reportDate,
        store.forecastMethod,
        r.category
      );
      for (const sr of subRisk) {
        groupedRows.push({ cells: riskRowCells(sr), level: 1, tier: sr.tier });
        const skus = buildRiskSkuDrilldownForSubCategory(
          store.inv01Rows,
          store.sa79Rows,
          store.orderRows,
          categoryTable,
          subCategoryTable,
          store.scope,
          reportDate,
          store.forecastMethod,
          r.category,
          sr.category
        );
        for (const d of skus) groupedRows.push({ cells: skuRowCells(d), level: 2, tier: d.tier });
      }
    }
    await exportGroupedExcel(`risk_flagging_${store.scope}.xlsx`, "Risk Flagging", columns, groupedRows, { tierColumnKey: "status" });
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
