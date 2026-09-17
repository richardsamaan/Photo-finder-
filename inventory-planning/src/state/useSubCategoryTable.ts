import { useMemo } from "react";
import { useAppStore } from "./appStore";
import { collectSubCategorySources, resolveSubCategories } from "../lib/subCategoryResolution";

/** The resolved SKU -> Sub Category table, ready to feed report builders. */
export function useSubCategoryTable(): Map<string, string> {
  const inv01Rows = useAppStore((s) => s.inv01Rows);
  const sa79Rows = useAppStore((s) => s.sa79Rows);
  const orderRows = useAppStore((s) => s.orderRows);
  const manualSubCategoryOverrides = useAppStore((s) => s.manualSubCategoryOverrides);
  const previousSubCategoryDecisionsMap = useAppStore((s) => s.previousSubCategoryDecisionsMap);

  return useMemo(() => {
    const sources = collectSubCategorySources(inv01Rows, sa79Rows);
    return resolveSubCategories(sources, orderRows, manualSubCategoryOverrides, previousSubCategoryDecisionsMap).table;
  }, [inv01Rows, sa79Rows, orderRows, manualSubCategoryOverrides, previousSubCategoryDecisionsMap]);
}
