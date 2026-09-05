import { test } from "node:test";
import assert from "node:assert/strict";
import { detectColumns } from "./fileParser.js";

test("detects standard headers", () => {
  const m = detectColumns(["Style Code", "Colour", "Category"]);
  // `colourCode` and `season` are optional fields on ColumnMapping (no
  // matching header present in this file, so they stay unmapped) -
  // everything else unchanged.
  assert.deepEqual(m, {
    styleCode: "Style Code",
    colour: "Colour",
    colourCode: null,
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

test("detects a Colour Code column and does not require it for confidence", () => {
  const m = detectColumns(["Style Code", "Colour", "Category", "Colour Code"]);
  assert.equal(m.colourCode, "Colour Code");
  assert.equal(m.confident, true);
});

test("detects aliased Colour Code headers (Color Code, Shade Code)", () => {
  assert.equal(detectColumns(["SKU", "Color", "Type", "Color Code"]).colourCode, "Color Code");
  assert.equal(detectColumns(["SKU", "Color", "Type", "Shade Code"]).colourCode, "Shade Code");
});

test("mapping stays confident with Colour present but Colour Code missing", () => {
  const m = detectColumns(["Style Code", "Colour", "Category"]);
  assert.equal(m.colourCode, null);
  assert.equal(m.confident, true);
});

// Regression: "Colour Code" contains "colour" as a substring, so a naive
// colour-name detector could grab it instead of (or as well as) a distinct
// "Colour Name" column - exactly the real sheet shape that motivated this
// (Colour Name: "Black", Colour Code: "009" as two separate columns).
test("does not let 'Colour Code' be mistaken for the colour-name column when both are present", () => {
  const m = detectColumns(["Style Code", "Colour Name", "Colour Code", "Category"]);
  assert.equal(m.colour, "Colour Name");
  assert.equal(m.colourCode, "Colour Code");
});
