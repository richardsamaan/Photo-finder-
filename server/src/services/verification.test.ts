import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate, classifyConfidence, rankCandidates } from "./verification.js";

const product = { styleCode: "50512345", colour: "Black", category: "T-Shirt" };

test("exact style code + colour + category on a known retailer => high confidence", () => {
  const score = scoreCandidate(
    product,
    {
      url: "https://asos.com/product/50512345",
      title: "Black T-Shirt - Style 50512345",
      snippet: "Shop the 50512345 t-shirt in black.",
      domain: "asos.com",
      imageUrl: "https://asos.com/img.jpg",
    },
    null
  );
  assert.equal(score.styleCodeMatch, true);
  assert.equal(score.colourMatch, true);
  assert.ok(score.confidence >= 70, `expected >=70, got ${score.confidence}`);
});

test("wrong style code is capped low even with matching colour/appearance text", () => {
  const score = scoreCandidate(
    product,
    {
      url: "https://example.com/product/99999999",
      title: "Black T-Shirt - Style 99999999",
      snippet: "A black t-shirt that looks similar.",
      domain: "example.com",
      imageUrl: "https://example.com/img.jpg",
    },
    null
  );
  assert.equal(score.styleCodeMatch, false);
  assert.ok(score.confidence <= 15, `expected <=15, got ${score.confidence}`);
});

test("matching style code but conflicting colour is strongly penalized", () => {
  const score = scoreCandidate(
    product,
    {
      url: "https://example.com/product/50512345",
      title: "Navy T-Shirt - Style 50512345",
      snippet: "The 50512345 t-shirt in navy blue.",
      domain: "example.com",
      imageUrl: "https://example.com/img.jpg",
    },
    null
  );
  assert.equal(score.styleCodeMatch, true);
  assert.equal(score.colourConflict, true);
  assert.ok(score.confidence < 50, `expected < 50, got ${score.confidence}`);
});

test("classifyConfidence thresholds", () => {
  assert.equal(classifyConfidence(95), "high_confidence");
  assert.equal(classifyConfidence(90), "high_confidence");
  assert.equal(classifyConfidence(89), "medium_confidence");
  assert.equal(classifyConfidence(70), "medium_confidence");
  assert.equal(classifyConfidence(69), "needs_review");
  assert.equal(classifyConfidence(0), "needs_review");
});

test("rankCandidates puts style-code matches ahead of non-matches regardless of raw score", () => {
  const a = scoreCandidate(
    product,
    {
      url: "https://reliable.com/a",
      title: "Similar black tshirt",
      snippet: "looks the same",
      domain: "asos.com",
      imageUrl: "https://x/a.jpg",
    },
    null
  );
  const b = scoreCandidate(
    product,
    {
      url: "https://example.com/b",
      title: "50512345 black t-shirt",
      snippet: "50512345",
      domain: "example.com",
    },
    null
  );
  const ranked = rankCandidates([a, b]);
  assert.equal(ranked[0].styleCodeMatch, true, "style-code match must rank first");
});
