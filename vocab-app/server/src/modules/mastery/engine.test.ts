import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDimensionScores,
  computeOverallMastery,
  countSuccessfulReviews,
  countRecentFailures,
  determineStatus,
  evaluateMastery,
  computeEffectiveMastery,
} from "./engine.js";
import { MASTERY_MIN_SUCCESSFUL_REVIEWS } from "./config.js";
import type { ReviewEvent } from "./types.js";

function event(testType: ReviewEvent["testType"], outcome: ReviewEvent["outcome"], occurredAt: string): ReviewEvent {
  return { testType, outcome, occurredAt };
}

test("a brand-new word with no history has zero overall mastery and status new", () => {
  const result = evaluateMastery([]);
  assert.equal(result.overallScore, 0);
  assert.equal(result.status, "new");
  for (const dim of Object.values(result.dimensions)) {
    assert.equal(dim.score, null);
    assert.equal(dim.evidenceCount, 0);
  }
});

test("a correct recognition test increases the recognition dimension from no evidence", () => {
  const events = [event("multiple_choice", "good", "2026-01-01T00:00:00Z")];
  const dims = computeDimensionScores(events);
  assert.ok(dims.recognition.score! > 0);
  assert.equal(dims.recognition.evidenceCount, 1);
  assert.equal(dims.recall.score, null, "recall was never tested and must not be assumed");
});

test("recall evidence grows faster than recognition evidence for the same outcome history", () => {
  const recognitionEvents: ReviewEvent[] = [
    event("multiple_choice", "good", "2026-01-01T00:00:00Z"),
    event("multiple_choice", "good", "2026-01-02T00:00:00Z"),
  ];
  const recallEvents: ReviewEvent[] = [
    event("meaning_to_english", "good", "2026-01-01T00:00:00Z"),
    event("meaning_to_english", "good", "2026-01-02T00:00:00Z"),
  ];
  const recognitionScore = computeDimensionScores(recognitionEvents).recognition.score!;
  const recallScore = computeDimensionScores(recallEvents).recall.score!;
  assert.ok(recallScore > recognitionScore, `expected recall (${recallScore}) > recognition (${recognitionScore})`);
});

test("a wrong answer decreases the dimension score", () => {
  const afterSuccess = computeDimensionScores([event("multiple_choice", "good", "2026-01-01T00:00:00Z")]).recognition
    .score!;
  const afterFailure = computeDimensionScores([
    event("multiple_choice", "good", "2026-01-01T00:00:00Z"),
    event("multiple_choice", "again", "2026-01-02T00:00:00Z"),
  ]).recognition.score!;
  assert.ok(afterFailure < afterSuccess);
});

test("repeated successful reviews keep increasing mastery, with diminishing returns, and never exceed 100", () => {
  const events: ReviewEvent[] = [];
  let lastScore = 0;
  for (let i = 0; i < 30; i++) {
    events.push(event("active_usage", "good", `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
    const score = computeDimensionScores(events).usage.score!;
    assert.ok(score >= lastScore, "score must not decrease on a success");
    assert.ok(score <= 100, "score must stay within [0, 100]");
    lastScore = score;
  }
  assert.ok(lastScore > 90, "many successes should approach mastery");
});

test("overall mastery uses only dimensions with evidence, unweighted by untested dimensions", () => {
  const events: ReviewEvent[] = [
    event("multiple_choice", "good", "2026-01-01T00:00:00Z"),
    event("multiple_choice", "good", "2026-01-02T00:00:00Z"),
    event("multiple_choice", "good", "2026-01-03T00:00:00Z"),
  ];
  const dims = computeDimensionScores(events);
  const overall = computeOverallMastery(dims);
  // With only recognition evidence, overall score must equal the
  // recognition score exactly (100% of the available weight).
  assert.equal(overall, dims.recognition.score);
});

test("status transitions follow the configured thresholds", () => {
  assert.equal(determineStatus(10, 0, 0), "new");
  assert.equal(determineStatus(40, 0, 0), "learning");
  assert.equal(determineStatus(70, 0, 0), "familiar");
});

test("a high score does not become mastered without enough successful reviews (insufficient evidence)", () => {
  assert.equal(determineStatus(95, MASTERY_MIN_SUCCESSFUL_REVIEWS - 1, 0), "familiar");
});

test("a high score with enough successes and no recent failures reaches mastered", () => {
  assert.equal(determineStatus(95, MASTERY_MIN_SUCCESSFUL_REVIEWS, 0), "mastered");
});

test("a recent failure blocks mastered even with plenty of lifetime successes", () => {
  assert.equal(determineStatus(95, MASTERY_MIN_SUCCESSFUL_REVIEWS + 5, 1), "familiar");
});

test("countSuccessfulReviews counts good/easy/hard but not again/dont_know", () => {
  const events: ReviewEvent[] = [
    event("active_usage", "good", "2026-01-01T00:00:00Z"),
    event("active_usage", "easy", "2026-01-02T00:00:00Z"),
    event("active_usage", "hard", "2026-01-03T00:00:00Z"),
    event("active_usage", "again", "2026-01-04T00:00:00Z"),
    event("active_usage", "dont_know", "2026-01-05T00:00:00Z"),
  ];
  assert.equal(countSuccessfulReviews(events), 3);
});

test("countRecentFailures only looks at the configured recent window", () => {
  const events: ReviewEvent[] = [
    event("active_usage", "again", "2026-01-01T00:00:00Z"), // outside the recent window of 3
    event("active_usage", "good", "2026-01-02T00:00:00Z"),
    event("active_usage", "good", "2026-01-03T00:00:00Z"),
    event("active_usage", "good", "2026-01-04T00:00:00Z"),
  ];
  assert.equal(countRecentFailures(events, 3), 0);
});

test("historical evidence is preserved - evaluating with the full history reproduces the same result as before, plus the new event", () => {
  const history: ReviewEvent[] = [
    event("multiple_choice", "good", "2026-01-01T00:00:00Z"),
    event("multiple_choice", "good", "2026-01-02T00:00:00Z"),
  ];
  const before = evaluateMastery(history);
  const after = evaluateMastery([...history, event("multiple_choice", "again", "2026-01-03T00:00:00Z")]);
  // The new evaluation is a strict function of ALL history, not just the
  // latest event - re-running with the same history is deterministic...
  assert.deepEqual(evaluateMastery(history), before);
  // ...and the earlier events still visibly influenced the outcome (the
  // failure doesn't erase prior evidence, it just adds to it).
  assert.notEqual(after.overallScore, 0);
});

test("decay: an unreviewed word's effective mastery drops below its base score over time", () => {
  const now = new Date("2026-04-01T00:00:00Z");
  const input = { baseScore: 80, lastReviewedAt: "2026-01-01T00:00:00Z", firstEncounteredAt: "2026-01-01T00:00:00Z" };
  const effective = computeEffectiveMastery(input, now);
  assert.ok(effective < 80);
  assert.ok(effective >= 0);
});

test("decay: a word reviewed moments ago has effective mastery equal to its base score", () => {
  const now = new Date("2026-01-01T00:00:05Z");
  const input = { baseScore: 70, lastReviewedAt: "2026-01-01T00:00:00Z", firstEncounteredAt: "2026-01-01T00:00:00Z" };
  assert.equal(computeEffectiveMastery(input, now), 70);
});

test("decay: a higher base mastery score decays more slowly than a lower one over the same elapsed time", () => {
  const now = new Date("2026-02-01T00:00:00Z");
  const lastReviewedAt = "2026-01-01T00:00:00Z";
  const firstEncounteredAt = lastReviewedAt;
  const highRetention = computeEffectiveMastery({ baseScore: 90, lastReviewedAt, firstEncounteredAt }, now) / 90;
  const lowRetention = computeEffectiveMastery({ baseScore: 30, lastReviewedAt, firstEncounteredAt }, now) / 30;
  assert.ok(highRetention > lowRetention);
});

test("decay never produces a negative score or one exceeding the base score", () => {
  const now = new Date("2030-01-01T00:00:00Z");
  const effective = computeEffectiveMastery(
    { baseScore: 50, lastReviewedAt: "2020-01-01T00:00:00Z", firstEncounteredAt: "2020-01-01T00:00:00Z" },
    now
  );
  assert.ok(effective >= 0 && effective <= 50);
});
