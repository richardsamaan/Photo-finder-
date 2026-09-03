import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildQuickSearchQueries } from "./queryBuilder.js";
import {
  dimensionsFromBuffer,
  dominantColourFromBuffer,
  hexToRgb,
  rgbDistance,
  isLikelyStockOrWatermarked,
  rankScore,
  MIN_SHORT_SIDE_PX,
  type ImageCandidate,
} from "./imageSearch.js";

test("buildQuickSearchQueries generates variations and de-dupes", () => {
  const queries = buildQuickSearchQueries({ query: "Nike Air Force 1" });
  assert.ok(queries.includes("Nike Air Force 1"));
  assert.ok(queries.some((q) => q.includes("product photo")));
  assert.ok(queries.some((q) => q.includes("high resolution")));
  assert.equal(queries.length, new Set(queries).size);
});

test("buildQuickSearchQueries adds colour-qualified passes when a colour name is given", () => {
  const withoutColour = buildQuickSearchQueries({ query: "wool coat" });
  const withColour = buildQuickSearchQueries({ query: "wool coat", colourName: "burgundy" });
  assert.ok(withColour.length > withoutColour.length);
  assert.ok(withColour.some((q) => q === "wool coat burgundy"));
  assert.ok(withColour.some((q) => q.includes("burgundy product photo")));
});

test("dimensionsFromBuffer reads real width/height from an in-memory image", async () => {
  const highRes = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 10, g: 10, b: 10 } },
  })
    .jpeg()
    .toBuffer();

  const dims = await dimensionsFromBuffer(highRes);
  assert.deepEqual(dims, { width: 1200, height: 900 });
  assert.ok(Math.min(dims!.width, dims!.height) >= MIN_SHORT_SIDE_PX, "1200x900 clears the 800px floor");

  const lowRes = await sharp({
    create: { width: 500, height: 500, channels: 3, background: { r: 10, g: 10, b: 10 } },
  })
    .jpeg()
    .toBuffer();
  const lowDims = await dimensionsFromBuffer(lowRes);
  assert.ok(Math.min(lowDims!.width, lowDims!.height) < MIN_SHORT_SIDE_PX, "500x500 fails the 800px floor");
});

test("dimensionsFromBuffer returns null for non-image bytes", async () => {
  const dims = await dimensionsFromBuffer(Buffer.from("not an image"));
  assert.equal(dims, null);
});

test("dominantColourFromBuffer recovers the fill colour of a solid image", async () => {
  const target = { r: 123, g: 30, b: 58 }; // burgundy-ish
  const buffer = await sharp({
    create: { width: 40, height: 40, channels: 3, background: target },
  })
    .png()
    .toBuffer();

  const rgb = await dominantColourFromBuffer(buffer);
  assert.ok(rgb, "expected a colour to be extracted");
  // JPEG/PNG re-encoding can shift values by a few units; allow slack.
  assert.ok(Math.abs(rgb!.r - target.r) <= 4);
  assert.ok(Math.abs(rgb!.g - target.g) <= 4);
  assert.ok(Math.abs(rgb!.b - target.b) <= 4);
});

test("hexToRgb parses valid hex codes and rejects malformed input", () => {
  assert.deepEqual(hexToRgb("#7B1E3A"), { r: 123, g: 30, b: 58 });
  assert.deepEqual(hexToRgb("7B1E3A"), { r: 123, g: 30, b: 58 });
  assert.equal(hexToRgb("not-a-colour"), null);
  assert.equal(hexToRgb("#FFF"), null);
});

test("rgbDistance is 0 for identical colours and grows with difference", () => {
  const a = { r: 0, g: 0, b: 0 };
  const b = { r: 255, g: 255, b: 255 };
  assert.equal(rgbDistance(a, a), 0);
  assert.ok(rgbDistance(a, b) > rgbDistance(a, { r: 10, g: 10, b: 10 }));
});

test("isLikelyStockOrWatermarked flags known stock-photo domains and watermark URLs", () => {
  assert.equal(isLikelyStockOrWatermarked("https://www.istockphoto.com/photo/x.jpg", "istockphoto.com"), true);
  assert.equal(
    isLikelyStockOrWatermarked("https://media.gettyimages.com/photos/x.jpg", "media.gettyimages.com"),
    true
  );
  assert.equal(isLikelyStockOrWatermarked("https://cdn.example.com/watermark-preview.jpg", "cdn.example.com"), true);
  assert.equal(isLikelyStockOrWatermarked("https://retailer.com/product.jpg", "retailer.com"), false);
});

test("rankScore prefers higher resolution when no colour target is set", () => {
  const small: ImageCandidate = { imageUrl: "a", sourceUrl: "a", title: "", domain: "d", width: 800, height: 800 };
  const large: ImageCandidate = { imageUrl: "b", sourceUrl: "b", title: "", domain: "d", width: 2000, height: 2000 };
  assert.ok(rankScore(large, false) > rankScore(small, false));
});

test("rankScore boosts a close colour match without ever dropping it to zero", () => {
  const farColour: ImageCandidate = {
    imageUrl: "a",
    sourceUrl: "a",
    title: "",
    domain: "d",
    width: 1600,
    height: 1600,
    colourDistance: 400, // near-opposite colour
  };
  const closeColour: ImageCandidate = {
    imageUrl: "b",
    sourceUrl: "b",
    title: "",
    domain: "d",
    width: 1600,
    height: 1600,
    colourDistance: 5, // near-identical colour
  };
  const closeScore = rankScore(closeColour, true);
  const farScore = rankScore(farColour, true);
  assert.ok(closeScore > farScore, "closer colour match should rank above a same-resolution far match");
  assert.ok(farScore > 0, "a far colour match is deprioritized, never zeroed out");
});

test("rankScore: a higher-resolution far-colour photo can still beat a low-resolution close match", () => {
  const bigButWrongColour: ImageCandidate = {
    imageUrl: "a",
    sourceUrl: "a",
    title: "",
    domain: "d",
    width: 4000,
    height: 4000,
    colourDistance: 300,
  };
  const smallButRightColour: ImageCandidate = {
    imageUrl: "b",
    sourceUrl: "b",
    title: "",
    domain: "d",
    width: 810,
    height: 810,
    colourDistance: 0,
  };
  assert.ok(rankScore(bigButWrongColour, true) > rankScore(smallButRightColour, true));
});
