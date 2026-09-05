import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEscalatingQueries } from "./queryBuilder.js";

test("attempt 1 is Style Code alone", () => {
  const queries = buildEscalatingQueries({ styleCode: "50469055", colour: "Black", colourCode: "009" });
  assert.equal(queries[0], "50469055");
});

test("attempt 2 adds Colour Name", () => {
  const queries = buildEscalatingQueries({ styleCode: "50469055", colour: "Black", colourCode: "009" });
  assert.equal(queries[1], "50469055 Black");
});

test("attempt 3 is Style Code + Colour Code, not combined with Colour Name, only when Colour Code is present", () => {
  const withColourCode = buildEscalatingQueries({ styleCode: "50469055", colour: "Black", colourCode: "009" });
  assert.equal(withColourCode.length, 3);
  assert.equal(withColourCode[2], "50469055 009");

  const withoutColourCode = buildEscalatingQueries({ styleCode: "50469055", colour: "Black", colourCode: "" });
  assert.equal(withoutColourCode.length, 2);
});

test("a missing colourCode field (not just blank) also skips attempt 3", () => {
  const queries = buildEscalatingQueries({ styleCode: "50469055", colour: "Black" });
  assert.deepEqual(queries, ["50469055", "50469055 Black"]);
});

test("a blank colour collapses attempt 1 and attempt 2 into one (de-duped)", () => {
  const queries = buildEscalatingQueries({ styleCode: "50469055", colour: "", colourCode: "009" });
  assert.deepEqual(queries, ["50469055", "50469055 009"]);
});

test("trims whitespace and collapses internal double spaces", () => {
  const queries = buildEscalatingQueries({ styleCode: " 50469055 ", colour: "  Black ", colourCode: " 009 " });
  assert.deepEqual(queries, ["50469055", "50469055 Black", "50469055 009"]);
});
