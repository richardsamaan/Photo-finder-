// Tunable SRS constants, centralized per the Phase 5 requirement. See
// docs/mastery-srs-engine.md for the reasoning behind the specific
// progression (it's a modified SM-2 - not a blind copy: HARD gets its own
// modest-growth branch instead of SM-2's single "quality 0-5" scale, and
// EASY gets an explicit extra multiplier for "substantially longer").
export const INITIAL_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;
export const MAX_EASE_FACTOR = 3.0;
export const MAX_INTERVAL_DAYS = 365;

export const AGAIN_INTERVAL_DAYS = 1;
export const AGAIN_EASE_PENALTY = 0.2;
export const HARD_EASE_PENALTY = 0.15;
export const EASY_EASE_BONUS = 0.15;
export const EASY_INTERVAL_BONUS = 1.3;

// First two successful repetitions use fixed staged intervals (classic
// SM-2 behavior) rather than the ease-factor formula, since multiplying a
// near-zero interval by an ease factor produces meaninglessly short gaps.
export const FIRST_REPETITION_INTERVAL_DAYS = 1;
export const SECOND_REPETITION_INTERVAL_DAYS = 6;
export const FIRST_EASY_REPETITION_INTERVAL_DAYS = 2;
export const SECOND_EASY_REPETITION_INTERVAL_DAYS = 8;
