import { test } from "node:test";
import assert from "node:assert/strict";
import { detectColumns } from "./fileParser.js";

test("detects standard headers", () => {
  const m = detectColumns(["Style Code", "Colour", "Category"]);
  assert.deepEqual(m, { styleCode: "Style Code", colour: "Colour", category: "Category", confident: true });
});

test("detects aliased headers (SKU, Color, Product Type)", () => {
  const m = detectColumns(["SKU", "Color", "Product Type"]);
  assert.equal(m.styleCode, "SKU");
  assert.equal(m.colour, "Color");
  assert.equal(m.category, "Product Type");
  assert.equal(m.confident, true);
});

test("marks unconfident when a column cannot be detected", () => {
  const m = detectColumns(["Widget Name", "Notes"]);
  assert.equal(m.confident, false);
});
