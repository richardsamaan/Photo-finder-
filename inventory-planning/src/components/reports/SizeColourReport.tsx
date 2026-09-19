import { Fragment, useMemo, useState } from "react";
import { useAppStore } from "../../state/appStore";
import { useCategoryTable } from "../../state/useCategoryTable";
import { useSubCategoryTable } from "../../state/useSubCategoryTable";
import { buildSizeColourSuggestion, buildSubCategorySizeColourSuggestion, type SizeColourRow } from "../../lib/reports";
import { colourKeyToMap } from "../../lib/parsers";
import { exportToPdf, fmtPct } from "../../lib/exportUtils";
import { exportGroupedExcel, type GroupedExportColumn, type GroupedExportRow } from "../../lib/groupedExcelExport";
import { useSortFilter, type SortFilterColumn } from "../../lib/tableSortFilter";
import { SortFilterTh } from "../SortFilterTh";

function groupByLabel(rows: SizeColourRow[]): [string, SizeColourRow[]][] {
  const map = new Map<string, SizeColourRow[]>();
  for (const r of rows) {
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category)!.push(r);
  }
  return [...map.entries()];
}

const SUGGESTION_VALUES: SizeColourRow["suggestion"][] = ["Increase (under-supplied)", "Decrease (over-supplied)", "Balanced"];

const sizeColourColumns: SortFilterColumn<SizeColourRow>[] = [
  { key: "size", type: "text", value: (r) => r.size },
  { key: "colour", type: "text", value: (r) => r.colour },
  { key: "salesMixPct", type: "number", value: (r) => r.salesMixPct },
  { key: "sohMixPct", type: "number", value: (r) => r.sohMixPct },
  { key: "diffPct", type: "number", value: (r) => r.diffPct },
  { key: "suggestion", type: "enum", value: (r) => r.suggestion, enumValues: SUGGESTION_VALUES },
];

/** One category's (or sub category's) Size/Colour table — sortable/filterable on its own, independent of any other table on the page. */
function SizeColourTable({ rows }: { rows: SizeColourRow[] }) {
  const sortFilter = useSortFilter(rows, sizeColourColumns);
  const th = (columnKey: string, text: string, type: "text" | "number" | "enum" = "number", enumValues?: string[]) => (
    <SortFilterTh
      columnKey={columnKey}
      label={text}
      type={type}
      enumValues={enumValues}
      sortKey={sortFilter.sortKey}
      sortDir={sortFilter.sortDir}
      onSort={sortFilter.toggleSort}
      filterValue={sortFilter.filters[columnKey] ?? ""}
      onFilterChange={sortFilter.setFilter}
      align={type === "number" ? "right" : "left"}
    />
  );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {th("size", "Size", "text")}
            {th("colour", "Colour", "text")}
            {th("salesMixPct", "Sales Mix %")}
            {th("sohMixPct", "SOH Mix %")}
            {th("diffPct", "Diff (pp)")}
            {th("suggestion", "Suggestion", "enum", SUGGESTION_VALUES)}
          </tr>
        </thead>
        <tbody>
          {sortFilter.rows.map((r, i) => (
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
      </table>
      {rows.length > 0 && sortFilter.rows.length === 0 && <p className="muted">No rows match the current filter.</p>}
    </div>
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

  function sizeColourRowCells(r: SizeColourRow): Record<string, unknown> {
    return {
      label: "",
      size: r.size,
      colour: r.colour,
      salesMixPct: r.salesMixPct,
      sohMixPct: r.sohMixPct,
      diffPct: r.diffPct,
      suggestion: r.suggestion,
    };
  }

  async function handleExcel() {
    const columns: GroupedExportColumn[] = [
      { header: "Category / Sub Category", key: "label", width: 26 },
      { header: "Size", key: "size" },
      { header: "Colour", key: "colour" },
      { header: "Sales Mix %", key: "salesMixPct", numFmt: "0.0" },
      { header: "SOH Mix %", key: "sohMixPct", numFmt: "0.0" },
      { header: "Diff (pp)", key: "diffPct", numFmt: "0.0" },
      { header: "Suggestion", key: "suggestion" },
    ];
    const groupedRows: GroupedExportRow[] = [];
    for (const [category, catRows] of grouped) {
      groupedRows.push({ cells: { label: category }, level: 0 });
      for (const r of catRows) groupedRows.push({ cells: sizeColourRowCells(r), level: 0 });

      const subStudy = buildSubCategorySizeColourSuggestion(
        store.inv01Rows,
        store.sa79Rows,
        categoryTable,
        subCategoryTable,
        colourKeyMap,
        store.scope,
        category
      );
      for (const [subCategory, subCatRows] of groupByLabel(subStudy)) {
        groupedRows.push({ cells: { label: subCategory }, level: 1 });
        for (const r of subCatRows) groupedRows.push({ cells: sizeColourRowCells(r), level: 1 });
      }
    }
    await exportGroupedExcel(`size_colour_suggestion_${store.scope}.xlsx`, "Size Colour %", columns, groupedRows);
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
          <SizeColourTable rows={catRows} />
          {expanded === category && (
            <div style={{ background: "#fafbfc", padding: 10, marginBottom: 10 }}>
              <div className="export-row">
                <span className="muted" style={{ marginRight: "auto" }}>
                  Sub Category detail for {category}
                </span>
              </div>
              {subGrouped.map(([subCategory, subCatRows]) => (
                <Fragment key={subCategory}>
                  <div style={{ marginTop: 10, marginBottom: 4, fontSize: 13, fontWeight: 600 }}>{subCategory}</div>
                  <SizeColourTable rows={subCatRows} />
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
