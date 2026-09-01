import { test } from "node:test";
import assert from "node:assert/strict";
import {
  textContainsStyleCode,
  textContainsColour,
  textContainsConflictingColour,
  textContainsCategory,
} from "./matching.js";

test("style code: exact token match", () => {
  assert.equal(textContainsStyleCode("Buy the 50512345 t-shirt now", "50512345"), true);
});

test("style code: does not match a longer unrelated number", () => {
  assert.equal(textContainsStyleCode("Order #150512345678 confirmed", "50512345"), false);
});

test("style code: matches with separators normalized", () => {
  assert.equal(textContainsStyleCode("SKU: 5051-2345", "50512345"), true);
});

test("style code: no match when absent", () => {
  assert.equal(textContainsStyleCode("Great black t-shirt for summer", "50512345"), false);
});

test("colour: direct match", () => {
  assert.equal(textContainsColour("Available in Black and White", "Black"), true);
});

test("colour: grey/gray synonym", () => {
  assert.equal(textContainsColour("Classic gray hoodie", "Grey"), true);
});

test("colour: no match", () => {
  assert.equal(textContainsColour("Available in Navy only", "Black"), false);
});

test("colour conflict: detects a different stated colour", () => {
  assert.equal(textContainsConflictingColour("This item is Navy Blue", "Black"), true);
});

test("colour conflict: no conflict when requested colour present", () => {
  assert.equal(textContainsConflictingColour("This item is Black", "Black"), false);
});

test("category: plural/singular tolerant", () => {
  assert.equal(textContainsCategory("Men's Trousers Collection", "Trousers"), true);
  assert.equal(textContainsCategory("Classic Trouser", "Trousers"), true);
});

test("category: synonym match", () => {
  assert.equal(textContainsCategory("Cotton Tee for everyday wear", "T-Shirt"), true);
});
