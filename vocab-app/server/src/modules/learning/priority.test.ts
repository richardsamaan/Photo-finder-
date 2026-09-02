import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQueuePriority } from "./priority.js";

test("needs-review always outranks a merely-overdue word", () => {
  const needsReview = computeQueuePriority({
    needsReview: true,
    overdueDays: 0,
    effectiveMasteryScore: 90,
    status: "mastered",
    incorrectCount: 0,
  });
  const overdue = computeQueuePriority({
    needsReview: false,
    overdueDays: 30,
    effectiveMasteryScore: 90,
    status: "mastered",
    incorrectCount: 0,
  });
  assert.ok(needsReview > overdue);
});

test("more overdue days increases priority", () => {
  const a = computeQueuePriority({ needsReview: false, overdueDays: 1, effectiveMasteryScore: 50, status: "learning", incorrectCount: 0 });
  const b = computeQueuePriority({ needsReview: false, overdueDays: 10, effectiveMasteryScore: 50, status: "learning", incorrectCount: 0 });
  assert.ok(b > a);
});

test("lower effective mastery (weaker retention) increases priority", () => {
  const strong = computeQueuePriority({ needsReview: false, overdueDays: 0, effectiveMasteryScore: 90, status: "familiar", incorrectCount: 0 });
  const weak = computeQueuePriority({ needsReview: false, overdueDays: 0, effectiveMasteryScore: 20, status: "familiar", incorrectCount: 0 });
  assert.ok(weak > strong);
});

test("priority is not simply a next_review_at proxy - a badly-decayed mastered word can outrank a barely-overdue learning word", () => {
  const decayedMastered = computeQueuePriority({
    needsReview: false,
    overdueDays: 0,
    effectiveMasteryScore: 10,
    status: "mastered",
    incorrectCount: 0,
  });
  const barelyOverdueLearning = computeQueuePriority({
    needsReview: false,
    overdueDays: 1,
    effectiveMasteryScore: 90,
    status: "learning",
    incorrectCount: 0,
  });
  assert.ok(decayedMastered > barelyOverdueLearning);
});
