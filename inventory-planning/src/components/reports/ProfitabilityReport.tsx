import { Fragment, useMemo, useState } from "react";
import { useAppStore } from "../../state/appStore";
import { useCategoryTable } from "../../state/useCategoryTable";
import { useSubCategoryTable } from "../../state/useSubCategoryTable";
import { ALL_LOCATIONS } from "../../types";
import {
  BAZAAR_LOCATION,
  CORE_LOCATIONS,
  buildSkuProfitFacts,
  groupProfitabilityByCategory,
  groupProfitabilityByLocation,
  groupProfitabilitySubCategoryWithinCategory,
  type ProfitGroupRow,
} from "../../lib/profitability";
import { exportToExcel, exportToPdf, fmtMoney, fmtNumber, fmtPct } from "../../lib/exportUtils";
import { exportGroupedExcel, type GroupedExportColumn, type GroupedExportRow } from "../../lib/groupedExcelExport";

type GroupBy = "category" | "location";

export function ProfitabilityReport() {
  const store = useAppStore();
  const categoryTable = useCategoryTable();
  const subCategoryTable = useSubCategoryTable();
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [includeBazaar, setIncludeBazaar] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const facts = useMemo(
    () => buildSkuProfitFacts(store.sa79Rows, categoryTable, subCategoryTable),
    [store.sa79Rows, categoryTable, subCategoryTable]
  );
  const coreLocationIds = useMemo(() => CORE_LOCATIONS.map((l) => l.id), []);
  const allLocationIds = useMemo(() => ALL_LOCATIONS.map((l) => l.id), []);

  const categoryCore = useMemo(
    () => (groupBy === "category" ? groupProfitabilityByCategory(facts, store.inv01Rows, categoryTable, coreLocationIds) : []),
    [groupBy, facts, store.inv01Rows, categoryTable, coreLocationIds]
  );
  const categoryIncl = useMemo(
    () => (groupBy === "category" && includeBazaar ? groupProfitabilityByCategory(facts, store.inv01Rows, categoryTable, allLocationIds) : []),
    [groupBy, includeBazaar, facts, store.inv01Rows, categoryTable, allLocationIds]
  );

  const subCategoryCore = useMemo(
    () =>
      groupBy === "category" && expanded
        ? groupProfitabilitySubCategoryWithinCategory(facts, store.inv01Rows, categoryTable, subCategoryTable, coreLocationIds, expanded)
        : [],
    [groupBy, expanded, facts, store.inv01Rows, categoryTable, subCategoryTable, coreLocationIds]
  );
  const subCategoryIncl = useMemo(
    () =>
      groupBy === "category" && expanded && includeBazaar
        ? groupProfitabilitySubCategoryWithinCategory(facts, store.inv01Rows, categoryTable, subCategoryTable, allLocationIds, expanded)
        : [],
    [groupBy, expanded, includeBazaar, facts, store.inv01Rows, categoryTable, subCategoryTable, allLocationIds]
  );

  const locationRows = useMemo(() => {
    if (groupBy !== "location") return [];
    const core = groupProfitabilityByLocation(facts, store.inv01Rows, CORE_LOCATIONS);
    core[0] = { ...core[0], label: "Combined (core retail)" };
    if (!includeBazaar) return core;
    const incl = groupProfitabilityByLocation(facts, store.inv01Rows, ALL_LOCATIONS);
    const combinedIncl = { ...incl[0], key: "combined-incl-bazaar", label: "Combined incl. Bazaar (clearance)" };
    const bazaarRow = incl.find((r) => r.key === BAZAAR_LOCATION.id)!;
    return [...core, combinedIncl, bazaarRow];
  }, [groupBy, includeBazaar, facts, store.inv01Rows]);

  function metricColumns(prefix: string, suffix: string) {
    return [
      { header: `Qty sold${suffix}`, key: `qtySold${prefix}`, format: fmtNumber },
      { header: `Margin %${suffix}`, key: `marginPct${prefix}`, format: fmtPct },
      { header: `Margin value${suffix}`, key: `marginValue${prefix}`, format: fmtMoney },
      { header: `Sell-through %${suffix}`, key: `sellThroughPct${prefix}`, format: fmtPct },
    ];
  }

  function categoryExportRows(): Record<string, unknown>[] {
    const inclByKey = new Map(categoryIncl.map((r) => [r.key, r]));
    return categoryCore.map((r) => {
      const incl = inclByKey.get(r.key);
      const row: Record<string, unknown> = {
        category: r.label,
        qtySoldCore: r.qtySold,
        marginPctCore: r.marginPct,
        marginValueCore: r.marginValue,
        sellThroughPctCore: r.sellThroughPct,
      };
      if (includeBazaar) {
        row.qtySoldIncl = incl?.qtySold ?? 0;
        row.marginPctIncl = incl?.marginPct ?? null;
        row.marginValueIncl = incl?.marginValue ?? 0;
        row.sellThroughPctIncl = incl?.sellThroughPct ?? null;
      }
      return row;
    });
  }

  function locationExportRows(): Record<string, unknown>[] {
    return locationRows.map((r) => ({
      location: r.label,
      qtySold: r.qtySold,
      salesExVat: r.salesExVat,
      costValue: r.costValue,
      marginPct: r.marginPct,
      marginValue: r.marginValue,
      soh: r.soh,
      sellThroughPct: r.sellThroughPct,
    }));
  }

  function profitRowCells(r: ProfitGroupRow, inclByKey: Map<string, ProfitGroupRow>): Record<string, unknown> {
    const incl = inclByKey.get(r.key);
    const cells: Record<string, unknown> = {
      label: r.label,
      qtySoldCore: r.qtySold,
      marginPctCore: r.marginPct,
      marginValueCore: r.marginValue,
      sellThroughPctCore: r.sellThroughPct,
    };
    if (includeBazaar) {
      cells.qtySoldIncl = incl?.qtySold ?? 0;
      cells.marginPctIncl = incl?.marginPct ?? null;
      cells.marginValueIncl = incl?.marginValue ?? null;
      cells.sellThroughPctIncl = incl?.sellThroughPct ?? null;
    }
    return cells;
  }

  function groupedMetricColumns(prefix: string, suffix: string): GroupedExportColumn[] {
    return [
      { header: `Qty sold${suffix}`, key: `qtySold${prefix}` },
      { header: `Margin %${suffix}`, key: `marginPct${prefix}`, numFmt: "0.0" },
      { header: `Margin value${suffix}`, key: `marginValue${prefix}`, numFmt: "#,##0.00" },
      { header: `Sell-through %${suffix}`, key: `sellThroughPct${prefix}`, numFmt: "0.0" },
    ];
  }

  async function handleExcel() {
    if (groupBy === "category") {
      const columns: GroupedExportColumn[] = [
        { header: "Category / Sub Category", key: "label", width: 26 },
        ...groupedMetricColumns("Core", includeBazaar ? " (core)" : ""),
        ...(includeBazaar ? groupedMetricColumns("Incl", " (incl. clearance)") : []),
      ];
      const categoryInclByKey = new Map(categoryIncl.map((r) => [r.key, r]));
      const groupedRows: GroupedExportRow[] = [];
      for (const core of categoryCore) {
        groupedRows.push({ cells: profitRowCells(core, categoryInclByKey), level: 0 });
        const subCore = groupProfitabilitySubCategoryWithinCategory(facts, store.inv01Rows, categoryTable, subCategoryTable, coreLocationIds, core.key);
        const subIncl = includeBazaar
          ? groupProfitabilitySubCategoryWithinCategory(facts, store.inv01Rows, categoryTable, subCategoryTable, allLocationIds, core.key)
          : [];
        const subInclByKey = new Map(subIncl.map((r) => [r.key, r]));
        for (const sub of subCore) groupedRows.push({ cells: profitRowCells(sub, subInclByKey), level: 1 });
      }
      await exportGroupedExcel("profitability_by_category.xlsx", "Profitability by Category", columns, groupedRows);
    } else {
      exportToExcel(
        "profitability_by_location.xlsx",
        "Profitability by Location",
        [
          { header: "Location", key: "location" },
          { header: "Qty sold", key: "qtySold" },
          { header: "Sales ex-VAT", key: "salesExVat" },
          { header: "Cost", key: "costValue" },
          { header: "Margin %", key: "marginPct" },
          { header: "Margin value", key: "marginValue" },
          { header: "SOH", key: "soh" },
          { header: "Sell-through %", key: "sellThroughPct" },
        ],
        locationExportRows()
      );
    }
  }

  function handlePdf() {
    if (groupBy === "category") {
      const columns = [
        { header: "Category", key: "category" },
        ...metricColumns("Core", includeBazaar ? " (core)" : ""),
        ...(includeBazaar ? metricColumns("Incl", " (incl.)") : []),
      ];
      exportToPdf("profitability_by_category.pdf", "Profitability — by Category", includeBazaar ? "Core retail vs. incl. Bazaar clearance" : "Core retail (locations 1–3)", columns, categoryExportRows());
    } else {
      exportToPdf(
        "profitability_by_location.pdf",
        "Profitability — by Location",
        includeBazaar ? "Including Bazaar (clearance)" : "Core retail locations",
        [
          { header: "Location", key: "location" },
          { header: "Qty sold", key: "qtySold", format: fmtNumber },
          { header: "Margin %", key: "marginPct", format: fmtPct },
          { header: "Margin value", key: "marginValue", format: fmtMoney },
          { header: "Sell-through %", key: "sellThroughPct", format: fmtPct },
        ],
        locationExportRows()
      );
    }
  }

  return (
    <div className="panel">
      <p className="muted">
        A SKU-level calculation engine (Cost, Sales ex-VAT, Qty Sold, Margin) — choose how to group and view it below.
        Margin %, Margin Value, and Sell-through % are shown side by side with no auto-weighting or combined score.
        "Sales ex-VAT" is SA79's Sale Value as-is — the source files carry no separate VAT field.
      </p>

      <div className="grid-2" style={{ marginBottom: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Group by</label>
          <div className="pill-row">
            <button className={`pill ${groupBy === "category" ? "active" : ""}`} onClick={() => setGroupBy("category")}>
              Category
            </button>
            <button className={`pill ${groupBy === "location" ? "active" : ""}`} onClick={() => setGroupBy("location")}>
              Location
            </button>
          </div>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Bazaar (clearance)</label>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={includeBazaar} onChange={(e) => setIncludeBazaar(e.target.checked)} /> Include
            Bazaar — off by default so clearance sales don't silently distort full-price margin; turning it on shows
            "margin including clearance" alongside the core retail view.
          </label>
        </div>
      </div>

      <div className="export-row">
        <button className="secondary" onClick={handleExcel}>
          Export Excel
        </button>
        <button className="secondary" onClick={handlePdf}>
          Export PDF
        </button>
      </div>

      {groupBy === "category" ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th rowSpan={2}></th>
                <th rowSpan={2}>Category</th>
                <th colSpan={4}>{includeBazaar ? "Core retail" : "Core retail (locations 1–3)"}</th>
                {includeBazaar && <th colSpan={4}>Incl. clearance (+ Bazaar)</th>}
              </tr>
              <tr>
                <th>Qty sold</th>
                <th>Margin %</th>
                <th>Margin value</th>
                <th>Sell-through %</th>
                {includeBazaar && (
                  <>
                    <th>Qty sold</th>
                    <th>Margin %</th>
                    <th>Margin value</th>
                    <th>Sell-through %</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {categoryCore.map((core) => {
                const incl = categoryIncl.find((r) => r.key === core.key);
                return (
                  <Fragment key={core.key}>
                    <tr>
                      <td>
                        <button className="small" onClick={() => setExpanded(expanded === core.key ? null : core.key)}>
                          {expanded === core.key ? "Hide" : "Drill into Sub Categories"}
                        </button>
                      </td>
                      <ProfitRowCells row={core} inclRow={incl} includeBazaar={includeBazaar} />
                    </tr>
                    {expanded === core.key && (
                      <tr>
                        <td colSpan={includeBazaar ? 10 : 6} style={{ background: "#fafbfc" }}>
                          <div className="export-row">
                            <span className="muted" style={{ marginRight: "auto" }}>
                              Sub Category detail for {core.label}
                            </span>
                          </div>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Sub Category</th>
                                  <th>Qty sold</th>
                                  <th>Margin %</th>
                                  <th>Margin value</th>
                                  <th>Sell-through %</th>
                                  {includeBazaar && (
                                    <>
                                      <th>Qty sold</th>
                                      <th>Margin %</th>
                                      <th>Margin value</th>
                                      <th>Sell-through %</th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {subCategoryCore.map((sub) => {
                                  const subIncl = subCategoryIncl.find((r) => r.key === sub.key);
                                  return (
                                    <tr key={sub.key}>
                                      <ProfitRowCells row={sub} inclRow={subIncl} includeBazaar={includeBazaar} />
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {subCategoryCore.length === 0 && <p className="muted">No sub categories found for this category.</p>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <LocationTable rows={locationRows} />
      )}
      {groupBy === "category" && categoryCore.length === 0 && <p className="muted">No data found.</p>}
    </div>
  );
}

function ProfitRowCells({ row, inclRow, includeBazaar }: { row: ProfitGroupRow; inclRow?: ProfitGroupRow; includeBazaar: boolean }) {
  return (
    <>
      <td>{row.label}</td>
      <td>{fmtNumber(row.qtySold)}</td>
      <td>{fmtPct(row.marginPct)}</td>
      <td>{fmtMoney(row.marginValue)}</td>
      <td>{fmtPct(row.sellThroughPct)}</td>
      {includeBazaar && (
        <>
          <td>{fmtNumber(inclRow?.qtySold ?? 0)}</td>
          <td>{fmtPct(inclRow?.marginPct ?? null)}</td>
          <td>{fmtMoney(inclRow?.marginValue ?? 0)}</td>
          <td>{fmtPct(inclRow?.sellThroughPct ?? null)}</td>
        </>
      )}
    </>
  );
}

function LocationTable({ rows }: { rows: ProfitGroupRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Location</th>
            <th>Qty sold</th>
            <th>Sales ex-VAT</th>
            <th>Cost</th>
            <th>Margin %</th>
            <th>Margin value</th>
            <th>SOH</th>
            <th>Sell-through %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={r.key.startsWith("combined") ? { fontWeight: 600, background: "#f8fafc" } : undefined}>
              <td>{r.label}</td>
              <td>{fmtNumber(r.qtySold)}</td>
              <td>{fmtMoney(r.salesExVat)}</td>
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
  );
}
