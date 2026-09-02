import type { SessionTestType } from "./sessionTypes.js";

// Centralized, tunable session-composition limits - never hard-coded in
// a React component. The backend enforces these; the frontend only
// displays them.
export const DEFAULT_NEW_WORD_LIMIT = 5;
export const DEFAULT_DAILY_REVIEW_LIMIT = 20;
export const MAX_SESSION_SIZE = 30; // hard ceiling regardless of session type

// Deterministic test-type rotation, not random selection (so sessions
// stay reproducible/testable). Two rotations bias which test types get
// picked first based on how the user has been doing on a word - this is
// difficulty *adaptation of test presentation*, not a change to the
// Phase 5 mastery/SRS algorithms themselves.
//
// Reinforcing (for words the user is struggling with): leads with
// recognition-based types, which are gentler, before asking for recall.
export const TEST_TYPE_ROTATION_REINFORCING: SessionTestType[] = [
  "multiple_choice",
  "english_to_meaning",
  "fill_blank",
  "meaning_to_english",
  "spelling",
];

// Challenging (for words the user handles well): leads with production
// types, which are stronger evidence per the Phase 5 dimension model.
export const TEST_TYPE_ROTATION_CHALLENGING: SessionTestType[] = [
  "meaning_to_english",
  "spelling",
  "fill_blank",
  "multiple_choice",
  "english_to_meaning",
];

// english_to_meaning is graded by keyword overlap against the real
// definition (no AI available) - this is the minimum fraction of the
// definition's significant words that must appear in the user's answer,
// on top of requiring at least one match. Deliberately lenient; this is
// an approximate heuristic, not semantic understanding.
export const MEANING_RECALL_MIN_OVERLAP_RATIO = 0.15;
