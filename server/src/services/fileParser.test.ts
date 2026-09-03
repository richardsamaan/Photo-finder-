import { test } from "node:test";
import assert from "node:assert/strict";
import { detectColumns } from "./fileParser.js";

test("detects standard headers", () => {
  const m = detectColumns(["Style Code", "Colour", "Category"]);
  // `season` is a new optional field on ColumnMapping (no Season header
  // present in this file, so it stays unmapped) - everything else unchanged.
  assert.deepEqual(m, {
    styleCode: "Style Code",
    colour: "Colour",
    category: "Category",
    season: null,
    confident: true,
  });
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

test("detects a Season column and does not require it for confidence", () => {
  const m = detectColumns(["Style Code", "Colour", "Category", "Season"]);
  assert.equal(m.season, "Season");
  assert.equal(m.confident, true);
});

test("detects aliased Season headers (Collection, Drop)", () => {
  assert.equal(detectColumns(["SKU", "Color", "Type", "Collection"]).season, "Collection");
  assert.equal(detectColumns(["SKU", "Color", "Type", "Drop"]).season, "Drop");
});

test("mapping stays confident with Category present but Season missing", () => {
  const m = detectColumns(["Style Code", "Colour", "Category"]);
  assert.equal(m.season, null);
  assert.equal(m.confident, true);
});

test("detects new Category alias variants (Product Group, Line)", () => {
  assert.equal(detectColumns(["SKU", "Color", "Product Group"]).category, "Product Group");
  assert.equal(detectColumns(["SKU", "Color", "Line"]).category, "Line");
});
