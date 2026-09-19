import { useMemo } from "react";
import { useAppStore } from "../state/appStore";
import { collectCategorySources, resolveCategories } from "../lib/categoryResolution";
import { collectSubCategorySources, resolveSubCategories } from "../lib/subCategoryResolution";
import { exportToExcel } from "../lib/exportUtils";
import { ConflictResolver, type NormalizedConflict } from "./ConflictResolver";
import type { CategoryConflict, SubCategoryConflict } from "../types";

function normalizeCategoryConflicts(conflicts: CategoryConflict[]): NormalizedConflict[] {
  return conflicts.map((c) => ({
    itemCode: c.itemCode,
    candidates: c.candidates.map((cand) => ({ source: cand.source, value: cand.category })),
  }));
}

function normalizeSubCategoryConflicts(conflicts: SubCategoryConflict[]): NormalizedConflict[] {
  return conflicts.map((c) => ({
    itemCode: c.itemCode,
    candidates: c.candidates.map((cand) => ({ source: cand.source, value: cand.subCategory })),
  }));
}

export function CategoriesStep() {
  const store = useAppStore();

  const sources = useMemo(
    () => collectCategorySources(store.inv01Rows, store.sa79Rows, store.orderRows),
    [store.inv01Rows, store.sa79Rows, store.orderRows]
  );
  const resolution = useMemo(
    () => resolveCategories(sources, store.manualOverrides, store.previousDecisionsMap),
    [sources, store.manualOverrides, store.previousDecisionsMap]
  );

  const subSources = useMemo(
    () => collectSubCategorySources(store.inv01Rows, store.sa79Rows, store.orderRows),
    [store.inv01Rows, store.sa79Rows, store.orderRows]
  );
  const subResolution = useMemo(
    () => resolveSubCategories(subSources, store.manualSubCategoryOverrides, store.previousSubCategoryDecisionsMap),
    [subSources, store.manualSubCategoryOverrides, store.previousSubCategoryDecisionsMap]
  );

  const allKnownCategories = useMemo(() => {
    const set = new Set<string>();
    for (const cat of resolution.table.values()) set.add(cat);
    return [...set].sort();
  }, [resolution.table]);

  const allKnownSubCategories = useMemo(() => {
    const set = new Set<string>();
    for (const subCat of subResolution.table.values()) set.add(subCat);
    return [...set].sort();
  }, [subResolution.table]);

  const normalizedAllConflicts = useMemo(() => normalizeCategoryConflicts(resolution.allConflicts), [resolution.allConflicts]);
  const normalizedUnresolvedConflicts = useMemo(() => normalizeCategoryConflicts(resolution.conflicts), [resolution.conflicts]);
  const normalizedAllSubConflicts = useMemo(() => normalizeSubCategoryConflicts(subResolution.allConflicts), [subResolution.allConflicts]);
  const normalizedUnresolvedSubConflicts = useMemo(
    () => normalizeSubCategoryConflicts(subResolution.conflicts),
    [subResolution.conflicts]
  );

  const canContinue = resolution.conflicts.length === 0 && subResolution.conflicts.length === 0;

  function downloadGuideline() {
    const itemCodes = new Set([...resolution.table.keys(), ...subResolution.table.keys()]);
    const decisions = [...itemCodes].sort().map((itemCode) => ({
      itemCode,
      category: resolution.table.get(itemCode) ?? "",
      subCategory: subResolution.table.get(itemCode) ?? "",
    }));
    exportToExcel(
      "category_guideline.xlsx",
      "Category Guideline",
      [
        { header: "Item Code", key: "itemCode" },
        { header: "Category", key: "category" },
        { header: "Sub Category", key: "subCategory" },
      ],
      decisions
    );
  }

  return (
    <div className="panel">
      <h2>Step 3 — Category resolution</h2>
      <p>
        Category and Sub Category are resolved fresh from the files you uploaded this session — there's no persistent
        database. INV01, SA79, and Order on the way are all equal sources: any SKU where two or more of them disagree
        is flagged as a conflict you must resolve below (one at a time, or in bulk); a SKU only one file mentions (or
        where every file agrees) is trusted automatically, no confirmation needed.
      </p>

      <div className="kv">
        <div className="item">
          <div className="label">SKUs categorized</div>
          <div className="value">{resolution.table.size}</div>
        </div>
        <div className="item">
          <div className="label">Category conflicts to resolve</div>
          <div className="value" style={{ color: resolution.conflicts.length ? "var(--red)" : "var(--green)" }}>
            {resolution.conflicts.length}
          </div>
        </div>
        <div className="item">
          <div className="label">Sub Category conflicts to resolve</div>
          <div className="value" style={{ color: subResolution.conflicts.length ? "var(--red)" : "var(--green)" }}>
            {subResolution.conflicts.length}
          </div>
        </div>
        <div className="item">
          <div className="label">From previous decisions</div>
          <div className="value">
            {resolution.fromPreviousDecisions.length} cat / {subResolution.fromPreviousDecisions.length} sub-cat
          </div>
        </div>
      </div>

      <ConflictResolver
        label="Category"
        allConflicts={normalizedAllConflicts}
        unresolvedConflicts={normalizedUnresolvedConflicts}
        manualOverrides={store.manualOverrides}
        knownValues={allKnownCategories}
        onSetOverride={store.setManualOverride}
        onSetOverrides={store.setManualOverrides}
      />

      <ConflictResolver
        label="Sub Category"
        allConflicts={normalizedAllSubConflicts}
        unresolvedConflicts={normalizedUnresolvedSubConflicts}
        manualOverrides={store.manualSubCategoryOverrides}
        knownValues={allKnownSubCategories}
        onSetOverride={store.setManualSubCategoryOverride}
        onSetOverrides={store.setManualSubCategoryOverrides}
      />

      {canContinue && (
        <div className="ok-box" style={{ marginTop: 16 }}>
          All conflicts are resolved. You're ready to view the reports.
        </div>
      )}

      <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <button
            className="secondary"
            disabled={resolution.table.size === 0 && subResolution.table.size === 0}
            onClick={downloadGuideline}
          >
            Download SKU category guideline
          </button>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Every categorized SKU this session ({resolution.table.size}), not just the ones you resolved by hand —
            load it back in as "previous category decisions" next time to skip re-resolving anything unchanged.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="secondary" onClick={() => store.setStep("mapping")}>
            ← Back
          </button>
          <button className="primary" disabled={!canContinue} onClick={() => store.setStep("reports")}>
            Continue to reports →
          </button>
        </div>
      </div>
    </div>
  );
}
