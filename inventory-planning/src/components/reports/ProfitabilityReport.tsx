import { useMemo, useState } from "react";
import { useAppStore } from "../../state/appStore";
import { useCategoryTable } from "../../state/useCategoryTable";
import { ALL_LOCATIONS } from "../../types";
import {
  BAZAAR_LOCATION,
  CORE_LOCATIONS,
  buildSkuProfitFacts,
  groupProfitabilityByCategory,
  groupProfitabilityByLocation,
  type ProfitGroupRow,
} from "../../lib/profitability";
import { exportToExcel, exportToPdf, fmtMoney, fmtNumber, fmtPct } from "../../lib/exportUtils";

type GroupBy = "category" | "location";

export function ProfitabilityReport() {
  const store = useAppStore();
  const categoryTable = useCategoryTable();
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [includeBazaar, setIncludeBazaar] = useState(false);

  const facts = useMemo(() => buildSkuProfitFacts(store.sa79Rows, categoryTable), [store.sa79Rows, categoryTable]);
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

  function handleExcel() {
    if (groupBy === "category") {
      const columns = [
        { header: "Category", key: "category" },
        ...metricColumns("Core", includeBazaar ? " (core)" : ""),
        ...(includeBazaar ? metricColumns("Incl", " (incl. clearance)") : []),
      ];
      exportToExcel("profitability_by_category.xlsx", "Profitability by Category", columns, categoryExportRows());
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
                  <tr key={core.key}>
                    <td>{core.label}</td>
                    <td>{fmtNumber(core.qtySold)}</td>
                    <td>{fmtPct(core.marginPct)}</td>
                    <td>{fmtMoney(core.marginValue)}</td>
                    <td>{fmtPct(core.sellThroughPct)}</td>
                    {includeBazaar && (
                      <>
                        <td>{fmtNumber(incl?.qtySold ?? 0)}</td>
                        <td>{fmtPct(incl?.marginPct ?? null)}</td>
                        <td>{fmtMoney(incl?.marginValue ?? 0)}</td>
                        <td>{fmtPct(incl?.sellThroughPct ?? null)}</td>
                      </>
                    )}
                  </tr>
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
