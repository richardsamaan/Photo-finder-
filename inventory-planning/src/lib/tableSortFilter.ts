import { useMemo, useState } from "react";

export type SortFilterColumnType = "text" | "number" | "date" | "enum";

export interface SortFilterColumn<T> {
  key: string;
  type?: SortFilterColumnType; // default "text"
  /** Raw value used for sorting (and, by default, for filtering too). */
  value: (row: T) => string | number | Date | null;
  /** Text used for a free-text filter match — defaults to String(value(row)). Only used when type !== "enum". */
  filterText?: (row: T) => string;
  /** Fixed set of values for a dropdown filter instead of free text (e.g. a Risk tier). */
  enumValues?: string[];
}

function compareRaw(a: string | number | Date | null, b: string | number | Date | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls sort last regardless of direction
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Shared sort/filter engine for a report's data table. Independent per call
 * site — a top-level table and its Sub Category drill-down each get their
 * own instance, so sorting/filtering the parent never disturbs the child
 * (or vice versa).
 */
export function useSortFilter<T>(rows: T[], columns: SortFilterColumn<T>[]) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<Record<string, string>>({});

  const columnsByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);

  const processedRows = useMemo(() => {
    let out = rows;

    const active = Object.entries(filters).filter(([, v]) => v);
    if (active.length > 0) {
      out = out.filter((row) =>
        active.every(([key, filterValue]) => {
          const col = columnsByKey.get(key);
          if (!col) return true;
          if (col.type === "enum") return String(col.value(row) ?? "") === filterValue;
          const text = col.filterText ? col.filterText(row) : String(col.value(row) ?? "");
          return text.toLowerCase().includes(filterValue.toLowerCase());
        })
      );
    }

    if (sortKey) {
      const col = columnsByKey.get(sortKey);
      if (col) {
        const dir = sortDir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => dir * compareRaw(col.value(a), col.value(b)));
      }
    }

    return out;
  }, [rows, filters, sortKey, sortDir, columnsByKey]);

  function toggleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir("asc");
    }
  }

  function setFilter(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return { rows: processedRows, sortKey, sortDir, filters, toggleSort, setFilter };
}
