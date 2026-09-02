import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeAnswer, gradeMeaningRecall } from "./grading.js";

test("multiple_choice: correct when submitted text matches the definition exactly", () => {
  assert.equal(
    gradeAnswer({
      testType: "multiple_choice",
      submittedText: "To successfully complete a goal.",
      correctWord: "achieve",
      correctDefinition: "To successfully complete a goal.",
    }),
    true
  );
});

test("multiple_choice: incorrect when submitted text does not match", () => {
  assert.equal(
    gradeAnswer({
      testType: "multiple_choice",
      submittedText: "A financial institution.",
      correctWord: "achieve",
      correctDefinition: "To successfully complete a goal.",
    }),
    false
  );
});

test("meaning_to_english: correct answer, case-insensitive", () => {
  assert.equal(
    gradeAnswer({ testType: "meaning_to_english", submittedText: "ACHIEVE", correctWord: "achieve", correctDefinition: "x" }),
    true
  );
  assert.equal(
    gradeAnswer({ testType: "meaning_to_english", submittedText: "  achieve  ", correctWord: "achieve", correctDefinition: "x" }),
    true
  );
});

test("meaning_to_english: incorrect answer", () => {
  assert.equal(
    gradeAnswer({ testType: "meaning_to_english", submittedText: "arrive", correctWord: "achieve", correctDefinition: "x" }),
    false
  );
});

test("fill_blank: correct answer, case-insensitive, matches the blanked token not just the base word", () => {
  assert.equal(
    gradeAnswer({
      testType: "fill_blank",
      submittedText: "Achieved",
      correctWord: "achieve",
      correctDefinition: "x",
      blankedToken: "achieved",
    }),
    true
  );
});

test("fill_blank: incorrect answer", () => {
  assert.equal(
    gradeAnswer({
      testType: "fill_blank",
      submittedText: "arrived",
      correctWord: "achieve",
      correctDefinition: "x",
      blankedToken: "achieved",
    }),
    false
  );
});

test("spelling: correct spelling, case-insensitive", () => {
  assert.equal(
    gradeAnswer({ testType: "spelling", submittedText: "Achieve", correctWord: "achieve", correctDefinition: "x" }),
    true
  );
});

test("spelling: incorrect spelling is not forgiven", () => {
  assert.equal(
    gradeAnswer({ testType: "spelling", submittedText: "acheive", correctWord: "achieve", correctDefinition: "x" }),
    false
  );
});

test("a null (skipped) answer is always incorrect, regardless of test type", () => {
  for (const testType of ["multiple_choice", "meaning_to_english", "fill_blank", "spelling", "english_to_meaning"] as const) {
    assert.equal(gradeAnswer({ testType, submittedText: null, correctWord: "achieve", correctDefinition: "x" }), false);
  }
});

test("gradeMeaningRecall: a genuine paraphrase using the definition's key words passes", () => {
  assert.equal(gradeMeaningRecall("to successfully reach a goal", "to successfully complete a goal or reach a result"), true);
});

test("gradeMeaningRecall: an unrelated answer fails", () => {
  assert.equal(gradeMeaningRecall("a type of fruit", "to successfully complete a goal or reach a result"), false);
});

test("gradeMeaningRecall: an empty answer fails", () => {
  assert.equal(gradeMeaningRecall("   ", "to successfully complete a goal"), false);
});
