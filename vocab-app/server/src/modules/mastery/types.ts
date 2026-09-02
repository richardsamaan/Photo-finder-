// Test-type categories the review engine understands. Some have no UI yet
// (Phase 5 builds only the minimal verification screen) - the point is
// that the engine already knows how to weigh evidence from all of them,
// so future test modes (Phase 8+) plug in without an architecture change.
export type TestType =
  | "english_to_meaning"
  | "meaning_to_english"
  | "multiple_choice"
  | "fill_blank"
  | "sentence_completion"
  | "context_recognition"
  | "spelling"
  | "listening"
  | "active_usage"
  | "ai_conversation";

// A review outcome is richer than correct/incorrect - it captures *how*
// the retrieval went, which the SRS engine schedules from and the mastery
// engine weighs as evidence strength.
export type ReviewOutcome = "again" | "hard" | "good" | "easy" | "dont_know";

// The dimensions of "knowing" a word. A word can score well on
// recognition while having zero recall evidence - the engine must never
// pretend an untested dimension has been proven.
export type Dimension = "recognition" | "recall" | "context" | "usage" | "spelling" | "listening";

export type VocabularyStatus = "new" | "learning" | "familiar" | "mastered";

// The minimal shape the mastery engine needs from a review-history row.
// Deliberately plain data (no DB types) so the engine stays testable
// without a database.
export interface ReviewEvent {
  testType: TestType;
  outcome: ReviewOutcome;
  occurredAt: string; // ISO or SQLite timestamp string - only used for ordering
}

export interface DimensionState {
  score: number | null; // null = no evidence yet for this dimension
  evidenceCount: number;
}

export type DimensionScores = Record<Dimension, DimensionState>;

export interface MasteryResult {
  dimensions: DimensionScores;
  overallScore: number; // 0-100, weighted average of dimensions WITH evidence only
  successfulReviews: number; // all-time count of good/easy/hard outcomes
  recentFailures: number; // failures within the recent-window used for the mastery gate
  status: VocabularyStatus;
}
