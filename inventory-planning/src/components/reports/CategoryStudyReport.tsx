import { Fragment, useMemo, useState } from "react";
import { useAppStore } from "../../state/appStore";
import { useCategoryTable } from "../../state/useCategoryTable";
import { useSubCategoryTable } from "../../state/useSubCategoryTable";
import { useReportDate } from "../../state/useReportDate";
import { buildCategoryStudy, buildSubCategoryStudy, type CategoryStudyRow } from "../../lib/reports";
import { FORECAST_METHODS, type ForecastMethod } from "../../types";
import { gapMonthsCount, yoyMonthList, yoyPeriodLabel } from "../../lib/forecast";
import { exportToPdf, fmtDate, fmtMonths, fmtNumber } from "../../lib/exportUtils";
import { exportGroupedExcel, type GroupedExportColumn, type GroupedExportRow } from "../../lib/groupedExcelExport";

function yoyLabelFor(reportDate: Date, nextShipmentDate: Date | null): string | null {
  if (!nextShipmentDate) return null;
  const count = gapMonthsCount(reportDate, nextShipmentDate);
  return yoyPeriodLabel(yoyMonthList(nextShipmentDate, count));
}

/** Cells for one CategoryStudyRow — shared between the top-level table and the Sub Category drill-down. */
function StudyRowCells({
  row,
  reportDate,
  method,
  compareAll,
}: {
  row: CategoryStudyRow;
  reportDate: Date;
  method: ForecastMethod;
  compareAll: boolean;
}) {
  const yoyLabel = yoyLabelFor(reportDate, row.nextShipmentDate);
  return (
    <>
      <td>{fmtNumber(row.soh)}</td>
      <td>{fmtNumber(row.sohCost)}</td>
      <td>{fmtDate(row.nextShipmentDate)}</td>
      <td>{row.forecasts[method].gapMonthsCount}</td>
      {compareAll ? (
        FORECAST_METHODS.map((m) => (
          <td key={m.id}>
            {fmtNumber(row.forecasts[m.id].forecastQty)}
            {m.id === "yoy" && yoyLabel && (
              <div className="muted" style={{ fontSize: 11 }}>
                {yoyLabel}
              </div>
            )}
          </td>
        ))
      ) : (
        <td>
          {fmtNumber(row.forecasts[method].forecastQty)}
          {method === "yoy" && yoyLabel && (
            <div className="muted" style={{ fontSize: 11 }}>
              {yoyLabel}
            </div>
          )}
        </td>
      )}
      <td>{fmtMonths(row.coverageMonths[method])}</td>
    </>
  );
}

function StudyTableHead({ label, compareAll, methodLabel }: { label: string; compareAll: boolean; methodLabel: string }) {
  return (
    <thead>
      <tr>
        <th></th>
        <th>{label}</th>
        <th>SOH (qty)</th>
        <th>SOH cost</th>
        <th>Next shipment</th>
        <th>Gap months</th>
        {compareAll ? FORECAST_METHODS.map((m) => <th key={m.id}>{m.label}</th>) : <th>Forecast ({methodLabel})</th>}
        <th>Coverage (months)</th>
      </tr>
    </thead>
  );
}

export function CategoryStudyReport() {
  const store = useAppStore();
  const categoryTable = useCategoryTable();
  const subCategoryTable = useSubCategoryTable();
  const { reportDate } = useReportDate();
  const [compareAll, setCompareAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(
    () => buildCategoryStudy(store.inv01Rows, store.sa79Rows, store.orderRows, categoryTable, store.scope, reportDate),
    [store.inv01Rows, store.sa79Rows, store.orderRows, categoryTable, store.scope, reportDate]
  );

  const subRows = useMemo(() => {
    if (!expanded) return [];
    return buildSubCategoryStudy(
      store.inv01Rows,
      store.sa79Rows,
      store.orderRows,
      categoryTable,
      subCategoryTable,
      store.scope,
      reportDate,
      expanded
    );
  }, [expanded, store.inv01Rows, store.sa79Rows, store.orderRows, categoryTable, subCategoryTable, store.scope, reportDate]);

  const methodLabel = FORECAST_METHODS.find((m) => m.id === store.forecastMethod)!.label;
  const includesYoy = compareAll || store.forecastMethod === "yoy";

  function exportRowsFor(source: CategoryStudyRow[]) {
    return source.map((r) => {
      const yoyLabel = yoyLabelFor(reportDate, r.nextShipmentDate);
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

  async function handleExcel() {
    const columns: GroupedExportColumn[] = [
      { header: "Category / Sub Category", key: "category", width: 26 },
      { header: "SOH (qty)", key: "soh" },
      { header: "SOH cost", key: "sohCost", numFmt: "#,##0.00" },
      { header: "Next shipment", key: "nextShipmentDate", numFmt: "yyyy-mm-dd" },
      { header: "Gap months", key: "gapMonths" },
      ...(compareAll
        ? FORECAST_METHODS.map((m) => ({ header: `Forecast — ${m.label}`, key: `forecast_${m.id}` }))
        : [{ header: `Forecast (${methodLabel})`, key: "forecastQty" }]),
      ...(includesYoy ? [{ header: "YoY period used", key: "yoyPeriod" }] : []),
      { header: "Coverage (months)", key: "coverageMonths", numFmt: "0.0" },
    ];
    const groupedRows: GroupedExportRow[] = [];
    for (const r of rows) {
      groupedRows.push({ cells: exportRowsFor([r])[0], level: 0 });
      const subStudy = buildSubCategoryStudy(
        store.inv01Rows,
        store.sa79Rows,
        store.orderRows,
        categoryTable,
        subCategoryTable,
        store.scope,
        reportDate,
        r.category
      );
      for (const cells of exportRowsFor(subStudy)) groupedRows.push({ cells, level: 1 });
    }
    await exportGroupedExcel(`category_study_${store.scope}.xlsx`, "Category Study", columns, groupedRows);
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
    exportToPdf(`category_study_${store.scope}.pdf`, "Category Study", `Scope: ${store.scope} — Method: ${methodLabel}`, columns, exportRowsFor(rows));
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
          <StudyTableHead label="Category" compareAll={compareAll} methodLabel={methodLabel} />
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.category}>
                <tr>
                  <td>
                    <button className="small" onClick={() => setExpanded(expanded === r.category ? null : r.category)}>
                      {expanded === r.category ? "Hide" : "Drill into Sub Categories"}
                    </button>
                  </td>
                  <td>{r.category}</td>
                  <StudyRowCells row={r} reportDate={reportDate} method={store.forecastMethod} compareAll={compareAll} />
                </tr>
                {expanded === r.category && (
                  <tr>
                    <td colSpan={compareAll ? 6 + FORECAST_METHODS.length : 7} style={{ background: "#fafbfc" }}>
                      <div className="export-row">
                        <span className="muted" style={{ marginRight: "auto" }}>
                          Sub Category detail for {r.category}
                        </span>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <StudyTableHead label="Sub Category" compareAll={compareAll} methodLabel={methodLabel} />
                          <tbody>
                            {subRows.map((sr) => (
                              <tr key={sr.category}>
                                <td></td>
                                <td>{sr.category}</td>
                                <StudyRowCells row={sr} reportDate={reportDate} method={store.forecastMethod} compareAll={compareAll} />
                              </tr>
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
      {rows.length === 0 && <p className="muted">No categories found for this view.</p>}
    </div>
  );
}
