import { useMemo, useState } from "react";
import { useAppStore } from "../../state/appStore";
import { useCategoryTable } from "../../state/useCategoryTable";
import { useReportDate } from "../../state/useReportDate";
import { buildCategoryStudy } from "../../lib/reports";
import { FORECAST_METHODS } from "../../types";
import { gapMonthsCount, yoyMonthList, yoyPeriodLabel } from "../../lib/forecast";
import { exportToExcel, exportToPdf, fmtDate, fmtMonths, fmtNumber } from "../../lib/exportUtils";

export function CategoryStudyReport() {
  const store = useAppStore();
  const categoryTable = useCategoryTable();
  const { reportDate } = useReportDate();
  const [compareAll, setCompareAll] = useState(false);

  const rows = useMemo(
    () => buildCategoryStudy(store.inv01Rows, store.sa79Rows, store.orderRows, categoryTable, store.scope, reportDate),
    [store.inv01Rows, store.sa79Rows, store.orderRows, categoryTable, store.scope, reportDate]
  );

  const methodLabel = FORECAST_METHODS.find((m) => m.id === store.forecastMethod)!.label;
  const includesYoy = compareAll || store.forecastMethod === "yoy";

  function yoyLabelFor(nextShipmentDate: Date | null): string | null {
    if (!nextShipmentDate) return null;
    const count = gapMonthsCount(reportDate, nextShipmentDate);
    return yoyPeriodLabel(yoyMonthList(nextShipmentDate, count));
  }

  function exportRows() {
    return rows.map((r) => {
      const yoyLabel = yoyLabelFor(r.nextShipmentDate);
      return {
        category: r.category,
        soh: r.soh,
        sohCost: r.sohCost,
        nextShipmentDate: r.nextShipmentDate,
        gapMonths: r.forecasts[store.forecastMethod].gapMonthsCount,
        forecastQty: Math.round(r.forecasts[store.forecastMethod].forecastQty * 10) / 10,
        forecastQtyDisplay:
          store.forecastMethod === "yoy" && yoyLabel
            ? `${fmtNumber(r.forecasts[store.forecastMethod].forecastQty)} (${yoyLabel})`
            : fmtNumber(r.forecasts[store.forecastMethod].forecastQty),
        coverageMonths: r.coverageMonths[store.forecastMethod],
        yoyPeriod: yoyLabel ?? "",
        ...Object.fromEntries(FORECAST_METHODS.map((m) => [`forecast_${m.id}`, Math.round(r.forecasts[m.id].forecastQty * 10) / 10])),
      };
    });
  }

  function handleExcel() {
    const columns = [
      { header: "Category", key: "category" },
      { header: "SOH (qty)", key: "soh" },
      { header: "SOH cost", key: "sohCost" },
      { header: "Next shipment", key: "nextShipmentDate", format: fmtDate },
      { header: "Gap months", key: "gapMonths" },
      ...(compareAll
        ? FORECAST_METHODS.map((m) => ({ header: `Forecast — ${m.label}`, key: `forecast_${m.id}` }))
        : [{ header: `Forecast (${methodLabel})`, key: "forecastQty" }]),
      ...(includesYoy ? [{ header: "YoY period used", key: "yoyPeriod" }] : []),
      { header: "Coverage (months)", key: "coverageMonths" },
    ];
    exportToExcel(`category_study_${store.scope}.xlsx`, "Category Study", columns, exportRows());
  }

  function handlePdf() {
    const columns = [
      { header: "Category", key: "category" },
      { header: "SOH", key: "soh", format: fmtNumber },
      { header: "Next shipment", key: "nextShipmentDate", format: fmtDate },
      { header: "Gap mo.", key: "gapMonths" },
      { header: `Forecast (${methodLabel})`, key: "forecastQtyDisplay" },
      { header: "Coverage (months)", key: "coverageMonths", format: fmtMonths },
    ];
    exportToPdf(`category_study_${store.scope}.pdf`, "Category Study", `Scope: ${store.scope} — Method: ${methodLabel}`, columns, exportRows());
  }

  return (
    <div className="panel">
      <div className="export-row">
        <label style={{ fontSize: 13, marginRight: "auto" }}>
          <input type="checkbox" checked={compareAll} onChange={(e) => setCompareAll(e.target.checked)} /> Compare all{" "}
          {FORECAST_METHODS.length} methods side by side
        </label>
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
              <th>SOH (qty)</th>
              <th>SOH cost</th>
              <th>Next shipment</th>
              <th>Gap months</th>
              {compareAll ? (
                FORECAST_METHODS.map((m) => <th key={m.id}>{m.label}</th>)
              ) : (
                <th>Forecast ({methodLabel})</th>
              )}
              <th>Coverage (months)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const yoyLabel = yoyLabelFor(r.nextShipmentDate);
              return (
                <tr key={r.category}>
                  <td>{r.category}</td>
                  <td>{fmtNumber(r.soh)}</td>
                  <td>{fmtNumber(r.sohCost)}</td>
                  <td>{fmtDate(r.nextShipmentDate)}</td>
                  <td>{r.forecasts[store.forecastMethod].gapMonthsCount}</td>
                  {compareAll ? (
                    FORECAST_METHODS.map((m) => (
                      <td key={m.id}>
                        {fmtNumber(r.forecasts[m.id].forecastQty)}
                        {m.id === "yoy" && yoyLabel && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {yoyLabel}
                          </div>
                        )}
                      </td>
                    ))
                  ) : (
                    <td>
                      {fmtNumber(r.forecasts[store.forecastMethod].forecastQty)}
                      {store.forecastMethod === "yoy" && yoyLabel && (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {yoyLabel}
                        </div>
                      )}
                    </td>
                  )}
                  <td>{fmtMonths(r.coverageMonths[store.forecastMethod])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted">No categories found for this view.</p>}
    </div>
  );
}
