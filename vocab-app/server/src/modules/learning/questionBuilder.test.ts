import { test } from "node:test";
import assert from "node:assert/strict";
import { findBlankToken, isEligibleTestType } from "./questionBuilder.js";

test("findBlankToken locates the exact base word", () => {
  const result = findBlankToken("She met her best friend in elementary school.", "friend");
  assert.equal(result?.token, "friend");
  assert.equal(result?.blanked, "She met her best _____ in elementary school.");
});

test("findBlankToken tolerates inflected forms via substring containment", () => {
  const result = findBlankToken("With steady practice, she finally achieved her goal.", "achieve");
  assert.equal(result?.token, "achieved");
  assert.ok(result?.blanked.includes("_____"));
  assert.ok(!result?.blanked.toLowerCase().includes("achieved"));
});

test("findBlankToken returns null when the word cannot be located in the sentence", () => {
  const result = findBlankToken("This sentence does not contain the target.", "resilient");
  assert.equal(result, null);
});

test("isEligibleTestType requires a sense for every test type", () => {
  assert.equal(isEligibleTestType("meaning_to_english", { sense: null, blankInfo: null, distractorCount: 10 }), false);
});

test("isEligibleTestType requires at least 3 distractors for multiple_choice", () => {
  const sense = { definition: "x", partOfSpeech: "noun", exampleSentence: null, phonetic: null, pronunciation: null };
  assert.equal(isEligibleTestType("multiple_choice", { sense, blankInfo: null, distractorCount: 2 }), false);
  assert.equal(isEligibleTestType("multiple_choice", { sense, blankInfo: null, distractorCount: 3 }), true);
});

test("isEligibleTestType requires a locatable blank for fill_blank", () => {
  const sense = { definition: "x", partOfSpeech: "noun", exampleSentence: null, phonetic: null, pronunciation: null };
  assert.equal(isEligibleTestType("fill_blank", { sense, blankInfo: null, distractorCount: 10 }), false);
  assert.equal(isEligibleTestType("fill_blank", { sense, blankInfo: { token: "x", blanked: "y" }, distractorCount: 10 }), true);
});

test("isEligibleTestType only needs a sense for meaning_to_english/spelling/english_to_meaning", () => {
  const sense = { definition: "x", partOfSpeech: "noun", exampleSentence: null, phonetic: null, pronunciation: null };
  for (const t of ["meaning_to_english", "spelling", "english_to_meaning"] as const) {
    assert.equal(isEligibleTestType(t, { sense, blankInfo: null, distractorCount: 0 }), true);
  }
});
