import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImageFilename, sanitizeCategoryFolder, isPathInside } from "./sanitize.js";

test("buildImageFilename produces STYLECODE-COLOUR.jpg", () => {
  assert.equal(buildImageFilename("50512345", "Black"), "50512345-Black.jpg");
});

test("buildImageFilename sanitizes special/path characters", () => {
  assert.equal(buildImageFilename("505/123?45", "Bl*ack"), "50512345-Black.jpg");
  assert.equal(buildImageFilename("../../etc/passwd", "x"), "etcpasswd-x.jpg");
});

test("sanitizeCategoryFolder falls back to Uncategorized when empty", () => {
  assert.equal(sanitizeCategoryFolder(""), "Uncategorized");
  assert.equal(sanitizeCategoryFolder("T-Shirts"), "T-Shirts");
});

test("isPathInside rejects traversal outside base", () => {
  assert.equal(isPathInside("/a/b", "/a/b/c"), true);
  assert.equal(isPathInside("/a/b", "/a/b/../c"), false);
});
