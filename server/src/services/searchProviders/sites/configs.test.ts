import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE_CONFIGS } from "./configs.js";

const EXPECTED_DOMAINS = [
  "hugoboss.com",
  "farfetch.com",
  "mrporter.com",
  "selfridges.com",
  "bloomingdales.com",
  "zalando.com",
  "endclothing.com",
  "nordstrom.com",
  "macys.com",
];

test("exposes exactly the 9 target retailer domains", () => {
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
