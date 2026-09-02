import {
  INITIAL_EASE_FACTOR,
  MIN_EASE_FACTOR,
  MAX_EASE_FACTOR,
  MAX_INTERVAL_DAYS,
  AGAIN_INTERVAL_DAYS,
  AGAIN_EASE_PENALTY,
  HARD_EASE_PENALTY,
  EASY_EASE_BONUS,
  EASY_INTERVAL_BONUS,
  FIRST_REPETITION_INTERVAL_DAYS,
  SECOND_REPETITION_INTERVAL_DAYS,
  FIRST_EASY_REPETITION_INTERVAL_DAYS,
  SECOND_EASY_REPETITION_INTERVAL_DAYS,
} from "./config.js";
import type { ReviewOutcome, SrsEngine, SrsState } from "./types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// A modified SM-2: AGAIN and "I don't know" always collapse back to a
// short, fixed interval and reset the repetition streak (strong negative
// evidence); HARD is a genuine success but grows the interval only
// modestly instead of via the ease factor, so it lands reliably shorter
// than GOOD; EASY gets both an ease-factor bonus and an explicit interval
// multiplier, so it grows substantially faster than GOOD rather than just
// slightly faster. This is deliberately not a literal SM-2 port - SM-2's
// single 0-5 "quality" scale is replaced with named outcomes that map
// to distinct branches, which is easier to reason about and to swap out
// via the SrsEngine interface later.
export const modifiedSm2Engine: SrsEngine = {
  initialState(): SrsState {
    return { intervalDays: 0, easeFactor: INITIAL_EASE_FACTOR, repetitions: 0 };
  },

  scheduleNext(state: SrsState, outcome: ReviewOutcome): SrsState {
    if (outcome === "again" || outcome === "dont_know") {
      return {
        intervalDays: AGAIN_INTERVAL_DAYS,
        easeFactor: clamp(state.easeFactor - AGAIN_EASE_PENALTY, MIN_EASE_FACTOR, MAX_EASE_FACTOR),
        repetitions: 0,
      };
    }

    const repetitions = state.repetitions + 1;

    if (outcome === "hard") {
      const easeFactor = clamp(state.easeFactor - HARD_EASE_PENALTY, MIN_EASE_FACTOR, MAX_EASE_FACTOR);
      const intervalDays = repetitions === 1 ? FIRST_REPETITION_INTERVAL_DAYS : Math.max(1, Math.round(state.intervalDays * 1.2));
      return { intervalDays: clamp(intervalDays, 1, MAX_INTERVAL_DAYS), easeFactor, repetitions };
    }

    if (outcome === "good") {
      const intervalDays =
        repetitions === 1
          ? FIRST_REPETITION_INTERVAL_DAYS
          : repetitions === 2
            ? SECOND_REPETITION_INTERVAL_DAYS
            : Math.round(state.intervalDays * state.easeFactor);
      return { intervalDays: clamp(intervalDays, 1, MAX_INTERVAL_DAYS), easeFactor: state.easeFactor, repetitions };
    }

    // easy
    const easeFactor = clamp(state.easeFactor + EASY_EASE_BONUS, MIN_EASE_FACTOR, MAX_EASE_FACTOR);
    const staged =
      repetitions === 1
        ? FIRST_EASY_REPETITION_INTERVAL_DAYS
        : repetitions === 2
          ? SECOND_EASY_REPETITION_INTERVAL_DAYS
          : Math.round(state.intervalDays * easeFactor);
    const intervalDays = Math.round(staged * EASY_INTERVAL_BONUS);
    return { intervalDays: clamp(intervalDays, 1, MAX_INTERVAL_DAYS), easeFactor, repetitions };
  },
};

export function nextReviewDate(intervalDays: number, from: Date): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + intervalDays);
  return d;
}

function parseDbDate(value: string): Date {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

export function isDue(nextReviewAt: string | null, now: Date): boolean {
  if (!nextReviewAt) return true; // never scheduled = a brand-new word, always available
  return parseDbDate(nextReviewAt) <= now;
}

export function overdueDays(nextReviewAt: string | null, now: Date): number {
  if (!nextReviewAt) return 0;
  const due = parseDbDate(nextReviewAt);
  const diffMs = now.getTime() - due.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}
