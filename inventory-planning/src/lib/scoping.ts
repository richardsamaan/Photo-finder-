import { COMBINED, LOCATIONS, type Inv01Row, type LocationId, type Sa79Row, type ViewScope } from "../types";

export function locationsForScope(scope: ViewScope): LocationId[] {
  return scope === COMBINED ? LOCATIONS.map((l) => l.id) : [scope];
}

/** Stock qty/cost for one INV01 row, summed across whichever locations the scope covers. */
export function stockForScope(row: Inv01Row, scope: ViewScope): { curStk: number; curStkCost: number } {
  const locs = locationsForScope(scope);
  let curStk = 0;
  let curStkCost = 0;
  for (const loc of locs) {
    const s = row.stock[loc];
    if (s) {
      curStk += s.curStk;
      curStkCost += s.curStkCost;
    }
  }
  return { curStk, curStkCost };
}

export function sa79ForScope(rows: Sa79Row[], scope: ViewScope): Sa79Row[] {
  if (scope === COMBINED) return rows;
  return rows.filter((r) => r.location === scope);
}
