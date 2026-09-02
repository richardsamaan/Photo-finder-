import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseTestType, pickRotation } from "./testTypeStrategy.js";
import { TEST_TYPE_ROTATION_CHALLENGING, TEST_TYPE_ROTATION_REINFORCING } from "./sessionConfig.js";

test("a brand-new word uses the reinforcing (recognition-first) rotation", () => {
  const rotation = pickRotation({ status: "new", correctCount: 0, incorrectCount: 0 });
  assert.deepEqual(rotation, TEST_TYPE_ROTATION_REINFORCING);
});

test("a word with more incorrect than correct answers uses the reinforcing rotation, even if familiar", () => {
  const rotation = pickRotation({ status: "familiar", correctCount: 2, incorrectCount: 5 });
  assert.deepEqual(rotation, TEST_TYPE_ROTATION_REINFORCING);
});

test("a word performing well uses the challenging (production-first) rotation", () => {
  const rotation = pickRotation({ status: "familiar", correctCount: 8, incorrectCount: 1 });
  assert.deepEqual(rotation, TEST_TYPE_ROTATION_CHALLENGING);
});

test("selection is deterministic - same inputs always produce the same test type", () => {
  const input = { status: "learning" as const, correctCount: 3, incorrectCount: 1 };
  const isEligible = () => true;
  const first = chooseTestType(input, 2, isEligible);
  const second = chooseTestType(input, 2, isEligible);
  assert.equal(first, second);
});

test("rotation varies test type across increasing indices when all types are eligible", () => {
  const input = { status: "new" as const, correctCount: 0, incorrectCount: 0 };
  const isEligible = () => true;
  const seen = new Set();
  for (let i = 0; i < TEST_TYPE_ROTATION_REINFORCING.length; i++) {
    seen.add(chooseTestType(input, i, isEligible));
  }
  assert.equal(seen.size, TEST_TYPE_ROTATION_REINFORCING.length, "expected every rotation slot to appear across a full cycle");
});

test("falls forward to an eligible type when the rotation's first choice is ineligible", () => {
  const input = { status: "new" as const, correctCount: 0, incorrectCount: 0 };
  // Reinforcing rotation starts with multiple_choice - make that ineligible.
  const result = chooseTestType(input, 0, (t) => t !== "multiple_choice");
  assert.notEqual(result, "multiple_choice");
  assert.ok(result !== null);
});

test("returns null when nothing is eligible", () => {
  const input = { status: "new" as const, correctCount: 0, incorrectCount: 0 };
  assert.equal(chooseTestType(input, 0, () => false), null);
});
