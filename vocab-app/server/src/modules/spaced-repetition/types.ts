import type { ReviewOutcome } from "../mastery/types.js";

export type { ReviewOutcome };

// The scheduling state a spaced-repetition algorithm needs to carry
// forward between reviews. Persisted on each vocabulary_review_history
// row (see docs/mastery-srs-engine.md for why) rather than as extra
// columns on user_vocabulary - "current SRS state" is just "whatever the
// most recent review row produced."
export interface SrsState {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
}

// The pluggable algorithm interface - swap `modifiedSm2Engine` for a
// different implementation later (e.g. FSRS) without touching the review
// service, routes, or UI that call it.
export interface SrsEngine {
  initialState(): SrsState;
  scheduleNext(state: SrsState, outcome: ReviewOutcome): SrsState;
}
