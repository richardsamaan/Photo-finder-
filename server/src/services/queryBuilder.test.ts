import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEscalatingQueries } from "./queryBuilder.js";

test("attempt 1 is Style Code alone", () => {
  const queries = buildEscalatingQueries({ styleCode: "50512345", colour: "Black", category: "T-Shirt" });
  assert.equal(queries[0], "50512345");
});

test("attempt 2 adds Colour Name", () => {
  const queries = buildEscalatingQueries({ styleCode: "50512345", colour: "Black", category: "T-Shirt" });
  assert.equal(queries[1], "50512345 Black");
});

test("attempt 3 adds Category, only when Category is present", () => {
  const withCategory = buildEscalatingQueries({ styleCode: "50512345", colour: "Black", category: "T-Shirt" });
  assert.equal(withCategory.length, 3);
  assert.equal(withCategory[2], "50512345 Black T-Shirt");

  const withoutCategory = buildEscalatingQueries({ styleCode: "50512345", colour: "Black", category: "" });
  assert.equal(withoutCategory.length, 2);
});

test("a blank colour collapses attempt 1 and attempt 2 into one (de-duped)", () => {
  const queries = buildEscalatingQueries({ styleCode: "50512345", colour: "", category: "T-Shirt" });
  assert.deepEqual(queries, ["50512345", "50512345 T-Shirt"]);
});

test("trims whitespace and collapses internal double spaces", () => {
  const queries = buildEscalatingQueries({ styleCode: " 50512345 ", colour: "  Black ", category: " T-Shirt " });
  assert.deepEqual(queries, ["50512345", "50512345 Black", "50512345 Black T-Shirt"]);
});
