import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE_CONFIGS } from "./configs.js";
import { extractProductCandidates } from "../extractProductCandidates.js";

const EXPECTED_DOMAINS = [
  "hugoboss.com",
  "farfetch.com",
  "mrporter.com",
  "selfridges.com",
  "endclothing.com",
];

test("exposes exactly the 5 target retailer domains", () => {
  assert.deepEqual(
    SITE_CONFIGS.map((c) => c.domain).sort(),
    [...EXPECTED_DOMAINS].sort()
  );
});

test("every config builds an https URL on its own domain", () => {
  for (const config of SITE_CONFIGS) {
    const url = new URL(config.buildSearchUrl("50512345"));
    assert.equal(url.protocol, "https:");
    assert.ok(
      url.hostname === config.domain || url.hostname === `www.${config.domain}`,
      `${config.domain} search URL host was ${url.hostname}`
    );
  }
});

test("every config URL-encodes the query, including spaces and special characters", () => {
  for (const config of SITE_CONFIGS) {
    const url = config.buildSearchUrl('50512345 Black & "Navy"');
    assert.ok(!url.includes(" "), `${config.domain} search URL contains a raw space: ${url}`);
    assert.ok(!url.includes('"'), `${config.domain} search URL contains a raw quote: ${url}`);
  }
});

test("each site's search URL carries the query in some query-string parameter", () => {
  for (const config of SITE_CONFIGS) {
    const url = new URL(config.buildSearchUrl("50512345"));
    assert.ok(
      Array.from(url.searchParams.values()).some((v) => v.includes("50512345")),
      `${config.domain} search URL has no query param carrying the search term: ${url}`
    );
  }
});

// Regression test for a real bug found on a live run (2026): hugoboss.com's
// generic ".html-ending" fallback let a category/listing page through as if
// it were a product page (the query matched an unrelated kids'/junior
// listing, and its "product image" was just the site's generic logo, since
// a listing page has no single product image). productUrlPattern now
// requires a real numeric product id before the .html.
test("hugoboss.com's productUrlPattern excludes category/listing pages but keeps real product pages", () => {
  const hugoBoss = SITE_CONFIGS.find((c) => c.domain === "hugoboss.com");
  assert.ok(hugoBoss?.productUrlPattern, "hugoboss.com should define a productUrlPattern override");

  const html = `
    <a href="/us/en/kids/junior-new-in.html">Junior New In</a>
    <a href="/us/en/womens/outerwear.html">Women's Outerwear</a>
    <a href="/us/en/slim-fit-shirt-in-cotton-poplin-50512345.html">Slim-Fit Shirt</a>
  `;
  const results = extractProductCandidates(html, "https://www.hugoboss.com/us/search/?q=50512345", {
    domain: "hugoboss.com",
    productUrlPattern: hugoBoss.productUrlPattern,
  });

  assert.equal(results.length, 1);
  assert.ok(results[0].url.endsWith("-50512345.html"));
});
