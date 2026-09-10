import { ALL_LOCATIONS, LOCATIONS, type LocationId } from "../types";
import type { StockColumnPair } from "../lib/inv01LocationColumns";

interface Props {
  pairs: StockColumnPair[];
  override: Record<number, LocationId | null>;
  onChange: (columnIndex: number, location: LocationId | null) => void;
}

export function StockPairMapping({ pairs, override, onChange }: Props) {
  if (pairs.length === 0) {
    return <div className="warn-box">No "Cur Stk" / "Cur Stk Cost" column pairs were detected in this file. Check the file format.</div>;
  }
  const chosen = Object.values(override).filter(Boolean);
  const missing = LOCATIONS.filter((l) => !chosen.includes(l.id));

  return (
    <div>
      <p className="muted">
        Detected {pairs.length} stock column pair(s). Confirm which location each pair belongs to (guessed from the
        label found in the row above the header row).
      </p>
      {pairs.map((p) => (
        <div className="field-row" key={p.columnIndex}>
          <label>
            {p.curStkHeader} / {p.curStkCostHeader}
            <br />
            <span className="muted">detected label: {p.labelAbove ?? "(none found)"}</span>
          </label>
          <select
            value={override[p.columnIndex] ?? ""}
            onChange={(e) => onChange(p.columnIndex, (e.target.value || null) as LocationId | null)}
          >
            <option value="">— not one of our locations —</option>
            {ALL_LOCATIONS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {missing.length > 0 && (
        <div className="warn-box">
          Not yet mapped: {missing.map((l) => l.label).join(", ")}. Reports for these location(s) will show zero stock
          until mapped.
        </div>
      )}
      <p className="muted">
        Bazaar (clearance) is optional to map — it's only used by the Profitability report's "Include Bazaar" toggle,
        and never appears in Category Study, Risk Flagging, or Size/Colour Suggestion %.
      </p>
    </div>
  );
}
