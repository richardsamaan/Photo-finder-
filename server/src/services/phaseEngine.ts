// Pure state machine for the three-phase escalating search strategy. No DB or
// I/O here on purpose - the job runner (queue.ts) materializes product rows
// from SQLite, calls planNextPhase() to decide what to do next, and writes
// the results back. Keeping this pure makes the phase-ordering logic (the
// part most likely to have an off-by-one bug) fully unit-testable.
//
//   Phase 1 - every item gets exactly 1 query attempt.
//   Phase 2 - starts only once every item has completed Phase 1; items still
//             not_found are retried with 2 query variants.
//   Phase 3 - starts only once every item has completed Phase 2; items still
//             not_found are retried with up to 4 query variants (the existing
//             default multi-query behaviour).
//
// The whole job always works the *earliest incomplete phase* across every
// item, so it can never let one item reach Phase 3 while another hasn't had
// its Phase 1 attempt yet - and it naturally falls through to Phase 2 the
// same day if Phase 1 finishes early and quota remains.

export type PhaseNumber = 1 | 2 | 3;

// Statuses that mean "this item has a valid outcome (or an explicit human
// decision) and should never be auto-retried by phase escalation again."
export const RESOLVED_STATUSES = new Set([
  "approved",
  "rejected",
  "high_confidence",
  "medium_confidence",
  "needs_review",
]);

export interface PhaseItem {
  id: string;
  status: string;
  /** Highest phase this item has completed an attempt for (0 = none yet). */
  searchPhase: number;
}

export interface PhasePlan {
  /** True when every item is resolved or has exhausted Phase 3. */
  done: boolean;
  targetPhase: PhaseNumber | null;
  /** Query variants to use for an attempt at targetPhase (1, 2, or 4). */
  requiredQueries: number;
  /** Item ids that still need an attempt at targetPhase. */
  eligibleIds: string[];
}

export function requiredQueriesForPhase(phase: PhaseNumber): number {
  if (phase === 1) return 1;
  if (phase === 2) return 2;
  return 4;
}

/** A resolved item is always treated as fully done, regardless of the phase it was resolved in. */
export function effectivePhaseCompleted(item: PhaseItem): number {
  if (RESOLVED_STATUSES.has(item.status)) return 3;
  return item.searchPhase;
}

export function planNextPhase(items: PhaseItem[]): PhasePlan {
  if (items.length === 0) {
    return { done: true, targetPhase: null, requiredQueries: 0, eligibleIds: [] };
  }

  const effective = items.map((item) => ({ id: item.id, phase: effectivePhaseCompleted(item) }));
  const minPhase = Math.min(...effective.map((item) => item.phase));

  if (minPhase >= 3) {
    return { done: true, targetPhase: null, requiredQueries: 0, eligibleIds: [] };
  }

  const targetPhase = (minPhase + 1) as PhaseNumber;
  const eligibleIds = effective.filter((item) => item.phase < targetPhase).map((item) => item.id);

  return { done: false, targetPhase, requiredQueries: requiredQueriesForPhase(targetPhase), eligibleIds };
}
