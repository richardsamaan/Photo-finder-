import {
  TEST_TYPE_DIMENSION,
  TEST_TYPE_EVIDENCE_STRENGTH,
  DIMENSION_WEIGHT,
  DIMENSION_LEARNING_RATE,
  DIMENSION_FORGET_RATE,
  EASY_SUCCESS_BONUS,
  HARD_SUCCESS_DISCOUNT,
  DONT_KNOW_EXTRA_PENALTY,
  MASTERY_THRESHOLDS,
  MASTERY_MIN_SUCCESSFUL_REVIEWS,
  MASTERY_RECENT_FAILURE_WINDOW,
  MASTERY_MAX_RECENT_FAILURES_FOR_MASTERED,
  DECAY_MIN_HALF_LIFE_DAYS,
  DECAY_MAX_HALF_LIFE_BONUS_DAYS,
} from "./config.js";
import type { Dimension, DimensionScores, MasteryResult, ReviewEvent, ReviewOutcome, VocabularyStatus } from "./types.js";

const DIMENSIONS: Dimension[] = ["recognition", "recall", "context", "usage", "spelling", "listening"];

export function isSuccessOutcome(outcome: ReviewOutcome): boolean {
  return outcome === "good" || outcome === "easy" || outcome === "hard";
}

export function isFailureOutcome(outcome: ReviewOutcome): boolean {
  return outcome === "again" || outcome === "dont_know";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sortByTime(events: ReviewEvent[]): ReviewEvent[] {
  return [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

// Per-dimension score: fold over that dimension's events in chronological
// order, nudging the score toward 100 on success or toward 0 on failure.
// A dimension with zero events stays `null` - "not yet proven" is a
// distinct state from "proven to be zero."
export function computeDimensionScores(events: ReviewEvent[]): DimensionScores {
  const result = {} as DimensionScores;

  for (const dimension of DIMENSIONS) {
    const dimensionEvents = sortByTime(events.filter((e) => TEST_TYPE_DIMENSION[e.testType] === dimension));

    if (dimensionEvents.length === 0) {
      result[dimension] = { score: null, evidenceCount: 0 };
      continue;
    }

    let score = 0;
    for (const event of dimensionEvents) {
      const strength = TEST_TYPE_EVIDENCE_STRENGTH[event.testType];
      if (isSuccessOutcome(event.outcome)) {
        const bonus = event.outcome === "easy" ? EASY_SUCCESS_BONUS : event.outcome === "hard" ? HARD_SUCCESS_DISCOUNT : 1;
        score = score + (100 - score) * DIMENSION_LEARNING_RATE * strength * bonus;
      } else {
        const penalty = event.outcome === "dont_know" ? DONT_KNOW_EXTRA_PENALTY : 1;
        score = score - score * DIMENSION_FORGET_RATE * strength * penalty;
      }
      score = clamp(score, 0, 100);
    }

    result[dimension] = { score: Math.round(score), evidenceCount: dimensionEvents.length };
  }

  return result;
}

// Weighted average across dimensions that actually have evidence. If only
// one dimension has ever been tested, the overall score IS that
// dimension's score - untested dimensions are never assumed to be 0 or
// any other value, so the score never gets diluted by non-evidence.
export function computeOverallMastery(dimensions: DimensionScores): number {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const dimension of DIMENSIONS) {
    const state = dimensions[dimension];
    if (state.score === null) continue;
    const weight = DIMENSION_WEIGHT[dimension];
    weightedSum += state.score * weight;
    weightTotal += weight;
  }

  if (weightTotal === 0) return 0;
  return Math.round(weightedSum / weightTotal);
}

export function countSuccessfulReviews(events: ReviewEvent[]): number {
  return events.filter((e) => isSuccessOutcome(e.outcome)).length;
}

export function countRecentFailures(events: ReviewEvent[], windowSize: number = MASTERY_RECENT_FAILURE_WINDOW): number {
  const recent = sortByTime(events).slice(-windowSize);
  return recent.filter((e) => isFailureOutcome(e.outcome)).length;
}

// A candidate status from the raw score is only ever a *candidate* -
// reaching "mastered" additionally requires enough lifetime successful
// retrievals AND no failure in the recent window, so a word can't become
// mastered off a single high score or a lucky streak that just broke.
export function determineStatus(overallScore: number, successfulReviews: number, recentFailures: number): VocabularyStatus {
  let candidate: VocabularyStatus;
  if (overallScore >= MASTERY_THRESHOLDS.mastered) candidate = "mastered";
  else if (overallScore >= MASTERY_THRESHOLDS.familiar) candidate = "familiar";
  else if (overallScore >= MASTERY_THRESHOLDS.learning) candidate = "learning";
  else candidate = "new";

  if (candidate === "mastered") {
    const hasEnoughEvidence = successfulReviews >= MASTERY_MIN_SUCCESSFUL_REVIEWS;
    const hasRecentFailure = recentFailures > MASTERY_MAX_RECENT_FAILURES_FOR_MASTERED;
    if (!hasEnoughEvidence || hasRecentFailure) {
      candidate = "familiar";
    }
  }

  return candidate;
}

// One entry point combining the steps above - what the review service
// calls after appending the new event to a word's full history.
export function evaluateMastery(events: ReviewEvent[]): MasteryResult {
  const dimensions = computeDimensionScores(events);
  const overallScore = computeOverallMastery(dimensions);
  const successfulReviews = countSuccessfulReviews(events);
  const recentFailures = countRecentFailures(events);
  const status = determineStatus(overallScore, successfulReviews, recentFailures);
  return { dimensions, overallScore, successfulReviews, recentFailures, status };
}

// ============================================================
// Decay: the persisted (base) mastery score is never touched by the
// passage of time - only a review event changes it. "Effective" mastery
// is a read-time projection of how much of that score should still be
// trusted right now, for review-queue and decay-return decisions.
// ============================================================

export interface MasteryDecayInput {
  baseScore: number;
  lastReviewedAt: string | null;
  firstEncounteredAt: string;
}

function parseDbDate(value: string): Date {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export function computeEffectiveMastery(input: MasteryDecayInput, now: Date): number {
  if (input.baseScore <= 0) return 0;

  const anchor = input.lastReviewedAt ?? input.firstEncounteredAt;
  const daysSince = daysBetween(parseDbDate(anchor), now);
  if (daysSince <= 0) return input.baseScore;

  const halfLife = DECAY_MIN_HALF_LIFE_DAYS + (input.baseScore / 100) * DECAY_MAX_HALF_LIFE_BONUS_DAYS;
  const decayFactor = Math.pow(0.5, daysSince / halfLife);
  return Math.round(input.baseScore * decayFactor);
}
