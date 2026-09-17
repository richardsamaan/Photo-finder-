import { useMemo, useState } from "react";
import { useAppStore } from "../state/appStore";
import { collectCategorySources, resolveCategories } from "../lib/categoryResolution";
import { collectSubCategorySources, resolveSubCategories } from "../lib/subCategoryResolution";
import { exportToExcel } from "../lib/exportUtils";

export function CategoriesStep() {
  const store = useAppStore();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [subDraft, setSubDraft] = useState<Record<string, string>>({});

  const sources = useMemo(() => collectCategorySources(store.inv01Rows, store.sa79Rows), [store.inv01Rows, store.sa79Rows]);
  const resolution = useMemo(
    () => resolveCategories(sources, store.orderRows, store.manualOverrides, store.previousDecisionsMap),
    [sources, store.orderRows, store.manualOverrides, store.previousDecisionsMap]
  );

  const subSources = useMemo(() => collectSubCategorySources(store.inv01Rows, store.sa79Rows), [store.inv01Rows, store.sa79Rows]);
  const subResolution = useMemo(
    () => resolveSubCategories(subSources, store.orderRows, store.manualSubCategoryOverrides, store.previousSubCategoryDecisionsMap),
    [subSources, store.orderRows, store.manualSubCategoryOverrides, store.previousSubCategoryDecisionsMap]
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

  const canContinue =
    resolution.conflicts.length === 0 &&
    resolution.newFromOrders.length === 0 &&
    subResolution.conflicts.length === 0 &&
    subResolution.newFromOrders.length === 0;

  function commit(itemCode: string, fallbackSuggestion?: string) {
    const value = (draft[itemCode] ?? fallbackSuggestion ?? "").trim();
    if (!value) return;
    store.setManualOverride(itemCode, value);
    setDraft((d) => ({ ...d, [itemCode]: "" }));
  }

  function commitSub(itemCode: string, fallbackSuggestion?: string) {
    const value = (subDraft[itemCode] ?? fallbackSuggestion ?? "").trim();
    if (!value) return;
    store.setManualSubCategoryOverride(itemCode, value);
    setSubDraft((d) => ({ ...d, [itemCode]: "" }));
  }

  const newItemsWithSuggestion = resolution.newFromOrders.filter((n) => n.suggestedCategory.trim() !== "");
  const newSubItemsWithSuggestion = subResolution.newFromOrders.filter((n) => n.suggestedSubCategory.trim() !== "");

  function confirmAllSuggested() {
    store.setManualOverrides(newItemsWithSuggestion.map((n) => [n.itemCode, n.suggestedCategory.trim()]));
  }

  function confirmAllSuggestedSub() {
    store.setManualSubCategoryOverrides(newSubItemsWithSuggestion.map((n) => [n.itemCode, n.suggestedSubCategory.trim()]));
  }

  function downloadDecisions() {
    const itemCodes = new Set([...store.manualOverrides.keys(), ...store.manualSubCategoryOverrides.keys()]);
    const decisions = [...itemCodes].sort().map((itemCode) => ({
      itemCode,
      category: store.manualOverrides.get(itemCode) ?? "",
      subCategory: store.manualSubCategoryOverrides.get(itemCode) ?? "",
    }));
    exportToExcel(
      "category_decisions.xlsx",
      "Category Decisions",
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
        database. Resolve every conflict and confirm every new item below before moving on to the reports.
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
          <div className="label">New items to confirm (Category)</div>
          <div className="value" style={{ color: resolution.newFromOrders.length ? "var(--red)" : "var(--green)" }}>
            {resolution.newFromOrders.length}
          </div>
        </div>
        <div className="item">
          <div className="label">Sub Category conflicts to resolve</div>
          <div className="value" style={{ color: subResolution.conflicts.length ? "var(--red)" : "var(--green)" }}>
            {subResolution.conflicts.length}
          </div>
        </div>
        <div className="item">
          <div className="label">New items to confirm (Sub Category)</div>
          <div className="value" style={{ color: subResolution.newFromOrders.length ? "var(--red)" : "var(--green)" }}>
            {subResolution.newFromOrders.length}
          </div>
        </div>
        <div className="item">
          <div className="label">From previous decisions</div>
          <div className="value">
            {resolution.fromPreviousDecisions.length} cat / {subResolution.fromPreviousDecisions.length} sub-cat
          </div>
        </div>
      </div>

      {resolution.conflicts.length > 0 && (
        <div>
          <h3>Category conflicts — same SKU, different category across files</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Candidates</th>
                  <th>Choose</th>
                </tr>
              </thead>
              <tbody>
                {resolution.conflicts.map((c) => (
                  <tr key={c.itemCode}>
                    <td>{c.itemCode}</td>
                    <td>
                      {c.candidates.map((cand) => (
                        <div key={cand.category}>
                          <button className="small" onClick={() => store.setManualOverride(c.itemCode, cand.category)}>
                            Use "{cand.category}"
                          </button>{" "}
                          <span className="muted">({cand.source})</span>
                        </div>
                      ))}
                    </td>
                    <td>
                      <input
                        type="text"
                        list="known-categories"
                        placeholder="or type a category"
                        value={draft[c.itemCode] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [c.itemCode]: e.target.value }))}
                      />{" "}
                      <button className="small" onClick={() => commit(c.itemCode)}>
                        Confirm
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resolution.newFromOrders.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3>New items from "Order on the way" (not yet in INV01/SA79) — Category</h3>
          <p className="muted">
            Suggested category comes from HB_Warehouse_ProdGrp — confirm or override before it's used in any report.
          </p>
          {newItemsWithSuggestion.length > 1 && (
            <div style={{ marginBottom: 10 }}>
              <button className="secondary" onClick={confirmAllSuggested}>
                Confirm all {newItemsWithSuggestion.length} suggested categories
              </button>{" "}
              <span className="muted">
                One click accepts every pre-filled suggestion below as-is — still an explicit confirmation, just not
                one row at a time. Override any individual row first if you don't want its suggestion accepted.
              </span>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item Code (EAN)</th>
                  <th>Suggested category</th>
                  <th>Confirm / override</th>
                </tr>
              </thead>
              <tbody>
                {resolution.newFromOrders.map((n) => (
                  <tr key={n.itemCode}>
                    <td>{n.itemCode}</td>
                    <td>{n.suggestedCategory || <span className="muted">(none suggested)</span>}</td>
                    <td>
                      <input
                        type="text"
                        list="known-categories"
                        placeholder={n.suggestedCategory || "type a category"}
                        value={draft[n.itemCode] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [n.itemCode]: e.target.value }))}
                      />{" "}
                      <button className="small" onClick={() => commit(n.itemCode, n.suggestedCategory)}>
                        Confirm
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subResolution.conflicts.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3>Sub Category conflicts — same SKU, different sub category across files</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Candidates</th>
                  <th>Choose</th>
                </tr>
              </thead>
              <tbody>
                {subResolution.conflicts.map((c) => (
                  <tr key={c.itemCode}>
                    <td>{c.itemCode}</td>
                    <td>
                      {c.candidates.map((cand) => (
                        <div key={cand.subCategory}>
                          <button className="small" onClick={() => store.setManualSubCategoryOverride(c.itemCode, cand.subCategory)}>
                            Use "{cand.subCategory}"
                          </button>{" "}
                          <span className="muted">({cand.source})</span>
                        </div>
                      ))}
                    </td>
                    <td>
                      <input
                        type="text"
                        list="known-subcategories"
                        placeholder="or type a sub category"
                        value={subDraft[c.itemCode] ?? ""}
                        onChange={(e) => setSubDraft((d) => ({ ...d, [c.itemCode]: e.target.value }))}
                      />{" "}
                      <button className="small" onClick={() => commitSub(c.itemCode)}>
                        Confirm
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subResolution.newFromOrders.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3>New items from "Order on the way" (not yet in INV01/SA79) — Sub Category</h3>
          <p className="muted">
            Suggested sub category comes from the order file's own "Sub Category" column — confirm or override before
            it's used in any report.
          </p>
          {newSubItemsWithSuggestion.length > 1 && (
            <div style={{ marginBottom: 10 }}>
              <button className="secondary" onClick={confirmAllSuggestedSub}>
                Confirm all {newSubItemsWithSuggestion.length} suggested sub categories
              </button>{" "}
              <span className="muted">
                One click accepts every pre-filled suggestion below as-is — still an explicit confirmation, just not
                one row at a time. Override any individual row first if you don't want its suggestion accepted.
              </span>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item Code (EAN)</th>
                  <th>Suggested sub category</th>
                  <th>Confirm / override</th>
                </tr>
              </thead>
              <tbody>
                {subResolution.newFromOrders.map((n) => (
                  <tr key={n.itemCode}>
                    <td>{n.itemCode}</td>
                    <td>{n.suggestedSubCategory || <span className="muted">(none suggested)</span>}</td>
                    <td>
                      <input
                        type="text"
                        list="known-subcategories"
                        placeholder={n.suggestedSubCategory || "type a sub category"}
                        value={subDraft[n.itemCode] ?? ""}
                        onChange={(e) => setSubDraft((d) => ({ ...d, [n.itemCode]: e.target.value }))}
                      />{" "}
                      <button className="small" onClick={() => commitSub(n.itemCode, n.suggestedSubCategory)}>
                        Confirm
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <datalist id="known-categories">
        {allKnownCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="known-subcategories">
        {allKnownSubCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {canContinue && (
        <div className="ok-box" style={{ marginTop: 16 }}>
          All conflicts and new items are resolved. You're ready to view the reports.
        </div>
      )}

      <div className="actions-row" style={{ justifyContent: "space-between" }}>
        <button
          className="secondary"
          disabled={store.manualOverrides.size === 0 && store.manualSubCategoryOverrides.size === 0}
          onClick={downloadDecisions}
        >
          Download my category decisions
        </button>
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
