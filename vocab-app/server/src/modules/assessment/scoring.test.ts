import { test } from "node:test";
import assert from "node:assert/strict";
import { computeResult } from "./scoring.js";

test("known and learning counts split correctly", () => {
  const result = computeResult([
    { difficultyLevel: "beginner", isCorrect: true, dontKnow: false },
    { difficultyLevel: "beginner", isCorrect: false, dontKnow: false },
    { difficultyLevel: "intermediate", isCorrect: false, dontKnow: true },
  ]);
  assert.equal(result.totalQuestions, 3);
  assert.equal(result.knownWordCount, 1);
  assert.equal(result.learningWordCount, 2);
});

test("a perfect score across all tiers yields the maximum estimate and high confidence", () => {
  const responses = [
    ...Array(5).fill({ difficultyLevel: "beginner", isCorrect: true, dontKnow: false }),
    ...Array(5).fill({ difficultyLevel: "intermediate", isCorrect: true, dontKnow: false }),
    ...Array(5).fill({ difficultyLevel: "advanced", isCorrect: true, dontKnow: false }),
  ];
  const result = computeResult(responses);
  assert.equal(result.estimatedVocabularySize, 1000 + 3000 + 6000);
  assert.equal(result.estimatedLevel, "C1"); // 10,000 falls just under the 12,000 C2 threshold
  assert.equal(result.confidence, "high");
});

test("a small sample yields low confidence", () => {
  const result = computeResult([{ difficultyLevel: "beginner", isCorrect: true, dontKnow: false }]);
  assert.equal(result.confidence, "low");
});

test("an all-unknown result still returns a labeled estimate instead of crashing", () => {
  const result = computeResult([{ difficultyLevel: "beginner", isCorrect: false, dontKnow: true }]);
  assert.equal(result.knownWordCount, 0);
  assert.equal(result.estimatedVocabularySize, 0);
  assert.equal(result.estimatedLevel, "A1");
});

test("doing well only at a harder tier credits the untested easier tier", () => {
  const result = computeResult([
    { difficultyLevel: "advanced", isCorrect: true, dontKnow: false },
    { difficultyLevel: "advanced", isCorrect: true, dontKnow: false },
  ]);
  // beginner + intermediate were never asked but are assumed known
  // because a harder tier was answered correctly.
  assert.equal(result.estimatedVocabularySize, 1000 + 3000 + 6000);
});
