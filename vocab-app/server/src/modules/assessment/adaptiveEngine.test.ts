import { test } from "node:test";
import assert from "node:assert/strict";
import { nextTier, shouldContinue, TIERS, MAX_QUESTIONS, STARTING_TIER } from "./adaptiveEngine.js";

test("a correct answer moves to the next harder tier", () => {
  assert.equal(nextTier("beginner", true), "intermediate");
  assert.equal(nextTier("intermediate", true), "advanced");
});

test("an incorrect answer moves to the next easier tier", () => {
  assert.equal(nextTier("advanced", false), "intermediate");
  assert.equal(nextTier("intermediate", false), "beginner");
});

test("tier movement is clamped at the boundaries", () => {
  assert.equal(nextTier("advanced", true), "advanced");
  assert.equal(nextTier("beginner", false), "beginner");
});

test("the assessment stops once the question budget is reached", () => {
  assert.equal(shouldContinue(MAX_QUESTIONS - 1, MAX_QUESTIONS), true);
  assert.equal(shouldContinue(MAX_QUESTIONS, MAX_QUESTIONS), false);
});

test("starting tier is a sane middle difficulty", () => {
  assert.equal(STARTING_TIER, "intermediate");
  assert.ok(TIERS.includes(STARTING_TIER));
});
