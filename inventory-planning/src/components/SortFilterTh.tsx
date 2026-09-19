import type { ReactNode } from "react";
import type { SortFilterColumnType } from "../lib/tableSortFilter";

/**
 * One <th> that's both a sort toggle (click the label) and, on its own row
 * underneath, a filter control (free text, or a dropdown for an "enum"
 * column with a small fixed set of values). Purely a rendering shell —
 * all state lives in the caller's useSortFilter() instance, so a parent
 * table and a Sub Category drill-down table underneath it each get their
 * own independent sort/filter without interfering with one another.
 */
export function SortFilterTh({
  columnKey,
  label,
  type = "text",
  enumValues,
  sortKey,
  sortDir,
  onSort,
  filterValue,
  onFilterChange,
  align,
  rowSpan,
}: {
  columnKey: string;
  label: string;
  type?: SortFilterColumnType;
  enumValues?: string[];
  sortKey: string | null;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  filterValue: string;
  onFilterChange: (key: string, value: string) => void;
  align?: "left" | "right";
  rowSpan?: number;
}) {
  const active = sortKey === columnKey;
  return (
    <th rowSpan={rowSpan} style={{ textAlign: align ?? "left", verticalAlign: "top" }}>
      <div
        onClick={() => onSort(columnKey)}
        style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span style={{ fontSize: 10, opacity: active ? 1 : 0.35 }}>{active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
      </div>
      {type === "enum" && enumValues ? (
        <select
          value={filterValue}
          onChange={(e) => onFilterChange(columnKey, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={{ width: "100%", fontSize: 11, marginTop: 3, fontWeight: 400 }}
        >
          <option value="">All</option>
          {enumValues.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          placeholder="Filter…"
          value={filterValue}
          onChange={(e) => onFilterChange(columnKey, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={{ width: "100%", fontSize: 11, marginTop: 3, fontWeight: 400, boxSizing: "border-box" }}
        />
      )}
    </th>
  );
}

/** A plain, non-interactive header cell for a column that isn't sortable/filterable in this render (e.g. a per-method forecast column shown only when "compare all" is on). */
export function PlainTh({ children, align }: { children: ReactNode; align?: "left" | "right" }) {
  return <th style={{ textAlign: align ?? "left", verticalAlign: "top" }}>{children}</th>;
}
