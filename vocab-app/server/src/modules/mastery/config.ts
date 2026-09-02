import type { Dimension, TestType } from "./types.js";

// ============================================================
// All tunable mastery-model constants live here, in one place, per the
// Phase 5 requirement to keep weighting/thresholds configurable rather
// than scattered through the codebase. See docs/mastery-srs-engine.md
// for the reasoning behind each of these.
// ============================================================

// Which dimension of "knowing a word" each test type provides evidence
// for. A test type contributes to exactly one dimension - if a future
// test type should count toward more than one, extend the model rather
// than force-fitting it here.
export const TEST_TYPE_DIMENSION: Record<TestType, Dimension> = {
  multiple_choice: "recognition",
  context_recognition: "recognition",
  english_to_meaning: "recall",
  meaning_to_english: "recall",
  fill_blank: "context",
  sentence_completion: "context",
  spelling: "spelling",
  listening: "listening",
  active_usage: "usage",
  ai_conversation: "usage",
};

// How strong a signal a given test type is, 0-1. Recognition (picking the
// right answer from options) is the weakest form of evidence; producing
// the word yourself (meaning_to_english, active_usage) is the strongest.
// This is what makes "recall has stronger evidence than recognition" true
// even when both map to the same evidence-update formula.
export const TEST_TYPE_EVIDENCE_STRENGTH: Record<TestType, number> = {
  multiple_choice: 0.6,
  context_recognition: 0.65,
  english_to_meaning: 0.85,
  meaning_to_english: 0.95,
  fill_blank: 0.8,
  sentence_completion: 0.85,
  spelling: 0.8,
  listening: 0.7,
  active_usage: 1.0,
  ai_conversation: 0.9,
};

// How much each dimension counts toward the overall score, when it has
// evidence. Recall and active usage are weighted highest because they are
// the closest proxies for "genuinely knows this word"; spelling/listening
// lowest because they test a narrower skill. Only used to rebalance
// weights among dimensions that actually have evidence (see engine.ts) -
// a word tested only via multiple_choice gets 100% of its score from
// recognition, never diluted by assuming untested dimensions are 0 or 50.
export const DIMENSION_WEIGHT: Record<Dimension, number> = {
  recognition: 0.15,
  recall: 0.3,
  context: 0.15,
  usage: 0.25,
  spelling: 0.05,
  listening: 0.1,
};

// Per-event evidence update. A success moves a dimension's score toward
// 100 by this fraction of the remaining distance (times test-type
// strength); a failure moves it toward 0 by this fraction of its current
// value. This is a simple, bounded, monotonic-with-diminishing-returns
// model (like an exponential moving average) - repeated success keeps
// raising mastery but with shrinking increments, never a hard step
// function, and it can't leave [0, 100].
export const DIMENSION_LEARNING_RATE = 0.35;
export const DIMENSION_FORGET_RATE = 0.5;

// Outcome-specific multipliers layered on top of the base update above.
export const EASY_SUCCESS_BONUS = 1.15;
export const HARD_SUCCESS_DISCOUNT = 0.7;
export const DONT_KNOW_EXTRA_PENALTY = 1.2;

// Status thresholds against the overall (0-100) score. These are
// candidates only - reaching "mastered" is additionally gated by the
// evidence requirement below, so a word can't jump straight to mastered
// off a single lucky streak.
export const MASTERY_THRESHOLDS = {
  learning: 30,
  familiar: 60,
  mastered: 85,
};

// A word needs at least this many successful (good/easy/hard) retrievals,
// all-time, before it's allowed to carry "mastered" - this is the
// "~10 successful reviews" target from the product brief, but it is only
// ONE of two gates (see recentFailures below), never the whole algorithm.
export const MASTERY_MIN_SUCCESSFUL_REVIEWS = 10;

// Even with enough lifetime successes, any failure within this many most
// recent reviews blocks "mastered" - a word that just tripped the user up
// is not durably known yet, regardless of its historical streak.
export const MASTERY_RECENT_FAILURE_WINDOW = 3;
export const MASTERY_MAX_RECENT_FAILURES_FOR_MASTERED = 0;

// ============================================================
// Decay / forgetting model. Mastery is measured from evidence
// (baseMasteryScore, persisted, never erased by time alone); the
// *effective* mastery used for review-queue decisions decays toward 0 the
// longer a word goes unreviewed, modeling the forgetting curve. A
// higher-mastery word is assumed to decay more slowly (well-established
// knowledge is more durable) - see docs/mastery-srs-engine.md.
// ============================================================

export const DECAY_MIN_HALF_LIFE_DAYS = 7; // a freshly-learned/low-mastery word roughly halves in ~1 week without review
export const DECAY_MAX_HALF_LIFE_BONUS_DAYS = 83; // a fully-mastered word's half-life approaches ~90 days
