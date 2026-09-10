import { useMemo } from "react";
import { useAppStore } from "./appStore";
import { collectCategorySources, resolveCategories } from "../lib/categoryResolution";

/** The resolved SKU -> Category table, ready to feed report builders. */
export function useCategoryTable(): Map<string, string> {
  const inv01Rows = useAppStore((s) => s.inv01Rows);
  const sa79Rows = useAppStore((s) => s.sa79Rows);
  const orderRows = useAppStore((s) => s.orderRows);
  const manualOverrides = useAppStore((s) => s.manualOverrides);
  const previousDecisionsMap = useAppStore((s) => s.previousDecisionsMap);

  return useMemo(() => {
    const sources = collectCategorySources(inv01Rows, sa79Rows);
    return resolveCategories(sources, orderRows, manualOverrides, previousDecisionsMap).table;
  }, [inv01Rows, sa79Rows, orderRows, manualOverrides, previousDecisionsMap]);
}
