import { useMemo, useState } from "react";

// Generic conflict-resolution UI shared by Category and Sub Category (same
// shape, just a different attribute name) — a full reviewable list first,
// then optional bulk-apply on top of it, with per-SKU override always
// available before and after any bulk action.

export interface NormalizedConflictCandidate {
  source: string;
  value: string;
}

export interface NormalizedConflict {
  itemCode: string;
  candidates: NormalizedConflictCandidate[];
}

interface ConflictResolverProps {
  /** "Category" | "Sub Category" — drives headings, labels, and the datalist id. */
  label: string;
  /** Every SKU where two or more sources disagree, whether resolved this session or not — the reviewable list. */
  allConflicts: NormalizedConflict[];
  /** The subset of allConflicts with no decision yet — what bulk-apply is allowed to touch, and what gates "Continue". */
  unresolvedConflicts: NormalizedConflict[];
  /** This session's explicit decisions (individual or bulk) — used to show each row's current resolution. */
  manualOverrides: Map<string, string>;
  /** For the free-text input's autocomplete. */
  knownValues: string[];
  onSetOverride: (itemCode: string, value: string) => void;
  onSetOverrides: (entries: [string, string][]) => void;
}

export function ConflictResolver({
  label,
  allConflicts,
  unresolvedConflicts,
  manualOverrides,
  knownValues,
  onSetOverride,
  onSetOverrides,
}: ConflictResolverProps) {
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});

  const labelLower = label.toLowerCase();
  const datalistId = `known-${labelLower.replace(/\s+/g, "-")}`;
  const filterLower = filter.trim().toLowerCase();

  function matchesFilter(c: NormalizedConflict): boolean {
    if (!filterLower) return true;
    if (c.itemCode.toLowerCase().includes(filterLower)) return true;
    return c.candidates.some((cand) => cand.value.toLowerCase().includes(filterLower));
  }

  const filteredAll = useMemo(() => allConflicts.filter(matchesFilter), [allConflicts, filterLower]);
  const filteredUnresolvedCount = useMemo(
    () => unresolvedConflicts.filter(matchesFilter).length,
    [unresolvedConflicts, filterLower]
  );

  // Every distinct source name appearing anywhere in the still-unresolved
  // conflicts — drives one bulk-apply button per source, dynamically (not
  // hardcoded to specific file names).
  const availableSources = useMemo(() => {
    const set = new Set<string>();
    for (const c of unresolvedConflicts) {
      for (const cand of c.candidates) {
        for (const s of cand.source.split(",")) set.add(s.trim());
      }
    }
    return [...set].sort();
  }, [unresolvedConflicts]);

  if (allConflicts.length === 0) return null;

  function commit(itemCode: string) {
    const value = (draft[itemCode] ?? "").trim();
    if (!value) return;
    onSetOverride(itemCode, value);
    setDraft((d) => ({ ...d, [itemCode]: "" }));
  }

  function bulkApply(sourceName: string) {
    const entries: [string, string][] = [];
    for (const c of unresolvedConflicts) {
      if (!matchesFilter(c)) continue;
      const match = c.candidates.find((cand) =>
        cand.source
          .split(",")
          .map((s) => s.trim())
          .includes(sourceName)
      );
      if (match) entries.push([c.itemCode, match.value]);
    }
    if (entries.length === 0) return;
    onSetOverrides(entries);
  }

  return (
    <div style={{ marginTop: 18 }}>
      <h3>
        {label} conflicts — same SKU, different {labelLower} across files
      </h3>
      <p className="muted">
        {unresolvedConflicts.length} of {allConflicts.length} still need a decision. Review the full list below before
        applying anything — a bulk rule only fills in whatever's currently unresolved (and matches your filter, if
        any); it never touches a SKU you've already resolved, individually or via an earlier bulk rule. You can always
        override any single SKU afterward.
      </p>

      <div className="export-row" style={{ flexWrap: "wrap", rowGap: 8 }}>
        <input
          type="text"
          placeholder={`Filter by Item Code or ${labelLower} value…`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ minWidth: 240, marginRight: "auto" }}
        />
        {availableSources.map((source) => (
          <button
            key={source}
            className="secondary"
            disabled={filteredUnresolvedCount === 0}
            onClick={() => bulkApply(source)}
            title={`Applies ${source}'s value to every unresolved conflict currently shown, then stops — nothing already resolved is touched.`}
          >
            Apply {source}'s value to all {filteredUnresolvedCount} shown
          </button>
        ))}
      </div>

      <div className="table-wrap" style={{ maxHeight: 480 }}>
        <table>
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Candidates</th>
              <th>Status</th>
              <th>Choose / override</th>
            </tr>
          </thead>
          <tbody>
            {filteredAll.map((c) => {
              const current = manualOverrides.get(c.itemCode);
              return (
                <tr key={c.itemCode}>
                  <td>{c.itemCode}</td>
                  <td>
                    {c.candidates.map((cand) => (
                      <div key={cand.value}>
                        <button className="small" onClick={() => onSetOverride(c.itemCode, cand.value)}>
                          Use "{cand.value}"
                        </button>{" "}
                        <span className="muted">({cand.source})</span>
                      </div>
                    ))}
                  </td>
                  <td>
                    {current ? <span className="badge green">✓ {current}</span> : <span className="badge red">Unresolved</span>}
                  </td>
                  <td>
                    <input
                      type="text"
                      list={datalistId}
                      placeholder={current ?? `type a ${labelLower}`}
                      value={draft[c.itemCode] ?? current ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [c.itemCode]: e.target.value }))}
                    />{" "}
                    <button className="small" onClick={() => commit(c.itemCode)}>
                      Confirm
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredAll.length === 0 && <p className="muted">No conflicts match this filter.</p>}
      </div>

      <datalist id={datalistId}>
        {knownValues.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </div>
  );
}
