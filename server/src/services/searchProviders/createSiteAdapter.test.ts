import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSiteAdapter } from "./createSiteAdapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "sites", "fixtures");
const readFixture = (name: string) => fs.readFileSync(path.join(fixturesDir, name), "utf-8");

const realFetch = globalThis.fetch;
test.after(() => {
  globalThis.fetch = realFetch;
});

function mockFetchOnce(status: number, body: string) {
  globalThis.fetch = (async () => new Response(body, { status })) as typeof fetch;
}

test("isConfigured() is always true - direct site search needs no credentials", () => {
  const adapter = createSiteAdapter({ domain: "example.com", buildSearchUrl: (q) => `https://example.com/?q=${q}` });
  assert.equal(adapter.isConfigured(), true);
});

test("search() extracts product candidates from an SFCC-style results page (hugoboss.com-like)", async () => {
  mockFetchOnce(200, readFixture("sfccStyleSearchResults.html"));
  const adapter = createSiteAdapter({
    domain: "hugoboss.com",
    buildSearchUrl: (q) => `https://www.hugoboss.com/us/search/?q=${encodeURIComponent(q)}`,
  });

  const results = await adapter.search("50512345");
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.domain === "hugoboss.com"));
  assert.ok(results.some((r) => r.url.includes("50512345")));
  assert.ok(results.some((r) => r.title.includes("Slim-Fit Shirt")));
});

test("search() extracts product candidates from a Magento-style results page (endclothing.com-like)", async () => {
  mockFetchOnce(200, readFixture("magentoStyleSearchResults.html"));
  const adapter = createSiteAdapter({
    domain: "endclothing.com",
    buildSearchUrl: (q) => `https://www.endclothing.com/us/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  });

  const results = await adapter.search("50512345");
  assert.equal(results.length, 1);
  assert.equal(results[0].domain, "endclothing.com");
  assert.ok(results[0].url.endsWith("slim-fit-shirt-50512345.html"));
  assert.equal(results[0].title, "Slim Fit Shirt - Black");
});

test("search() extracts a product link from a JSON-LD-carrying results page (department-store-like)", async () => {
  mockFetchOnce(200, readFixture("jsonLdSearchResults.html"));
  const adapter = createSiteAdapter({
    domain: "selfridges.com",
    buildSearchUrl: (q) => `https://www.selfridges.com/US/en/search/?q=${encodeURIComponent(q)}`,
  });

  const results = await adapter.search("50567890");
  assert.equal(results.length, 1);
  assert.ok(results[0].url.includes("50567890"));
});

test("a legitimate zero-results page returns an empty array, not an error", async () => {
  mockFetchOnce(200, "<html><body>No results found.</body></html>");
  const adapter = createSiteAdapter({ domain: "example.com", buildSearchUrl: (q) => `https://example.com/?q=${q}` });
  const results = await adapter.search("nonexistent-style-code");
  assert.deepEqual(results, []);
});

test("throws (rather than returning fabricated results) on a bot-check response, after retrying", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("Please complete this CAPTCHA to continue", { status: 200 });
  }) as typeof fetch;

  const adapter = createSiteAdapter({ domain: "example.com", buildSearchUrl: (q) => `https://example.com/?q=${q}` });
  await assert.rejects(() => adapter.search("50512345"));
  assert.ok(calls >= 2, "expected at least one retry before giving up");
});

test("throws on a non-OK HTTP status", async () => {
  mockFetchOnce(500, "Internal Server Error");
  const adapter = createSiteAdapter({ domain: "example.com", buildSearchUrl: (q) => `https://example.com/?q=${q}` });
  await assert.rejects(() => adapter.search("50512345"));
});

// Regression: a live run against real sites returned 403 (bot-check) for
// some and 404 (wrong URL) for others - two very different problems that
// the original error message ("Blocked or non-OK response") didn't
// distinguish, which cost a round-trip to diagnose. The message itself is
// now the diagnostic signal.
test("a 404 error message says the URL is wrong, not that the site blocked us", async () => {
  mockFetchOnce(404, "Not Found");
  const adapter = createSiteAdapter({ domain: "example.com", buildSearchUrl: (q) => `https://example.com/?q=${q}` });
  await assert.rejects(() => adapter.search("50512345"), /404 from example\.com.*URL pattern is likely wrong/);
});

test("a bot-check response's error message says BLOCKED, not a URL problem", async () => {
  globalThis.fetch = (async () => new Response("Please complete this CAPTCHA to continue", { status: 200 })) as typeof fetch;
  const adapter = createSiteAdapter({ domain: "example.com", buildSearchUrl: (q) => `https://example.com/?q=${q}` });
  await assert.rejects(() => adapter.search("50512345"), /BLOCKED by example\.com.*not a URL problem/);
});
