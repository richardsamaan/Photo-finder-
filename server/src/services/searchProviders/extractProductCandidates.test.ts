import { test } from "node:test";
import assert from "node:assert/strict";
import { extractProductCandidates } from "./extractProductCandidates.js";

const SEARCH_PAGE_URL = "https://www.example-retailer.com/search?q=50512345";

// A representative, hand-built search-results page: a couple of real
// product tiles plus the kind of nav/account/footer chrome every retailer's
// page also carries, so the extractor is exercised against exactly the
// ambiguity it has to resolve.
const FIXTURE_HTML = `
<!doctype html>
<html>
<body>
  <nav>
    <a href="/account/login">Sign In</a>
    <a href="/help/customer-service">Help</a>
    <a href="/search?q=other">Search</a>
  </nav>
  <div class="results-grid">
    <a href="/us/en/mens-shirt-50512345.html" class="product-tile">
      <img src="/img/50512345.jpg" alt="Style 50512345 Black Shirt" />
    </a>
    <a href="/p/50567890/navy-jacket" aria-label="Navy Jacket 50567890">
      <img src="/img/50567890.jpg" alt="" />
    </a>
    <a href="/en-us/product/999111" >Plain text tile title</a>
  </div>
  <footer>
    <a href="/about">About Us</a>
    <a href="https://other-domain.com/ad">Sponsored</a>
    <a href="#">No-op</a>
    <a href="javascript:void(0)">JS link</a>
  </footer>
</body>
</html>
`;

test("extracts real product links and ignores nav/account/footer chrome", () => {
  const results = extractProductCandidates(FIXTURE_HTML, SEARCH_PAGE_URL, {
    domain: "example-retailer.com",
  });

  const urls = results.map((r) => r.url);
  assert.ok(urls.some((u) => u.endsWith("/us/en/mens-shirt-50512345.html")));
  assert.ok(urls.some((u) => u.endsWith("/p/50567890/navy-jacket")));
  assert.ok(urls.some((u) => u.endsWith("/en-us/product/999111")));

  assert.ok(!urls.some((u) => u.includes("/account/login")));
  assert.ok(!urls.some((u) => u.includes("/help/")));
  assert.ok(!urls.some((u) => u.includes("/search?")));
  assert.ok(!urls.some((u) => u.includes("/about")));
});

test("ignores links to a different domain entirely", () => {
  const results = extractProductCandidates(FIXTURE_HTML, SEARCH_PAGE_URL, {
    domain: "example-retailer.com",
  });
  assert.ok(!results.some((r) => r.url.includes("other-domain.com")));
});

test("resolves relative hrefs against the search page URL", () => {
  const results = extractProductCandidates(FIXTURE_HTML, SEARCH_PAGE_URL, {
    domain: "example-retailer.com",
  });
  const jacket = results.find((r) => r.url.includes("50567890"));
  assert.ok(jacket);
  assert.equal(jacket!.url, "https://www.example-retailer.com/p/50567890/navy-jacket");
});

test("prefers aria-label, then image alt text, then link text for the title", () => {
  const results = extractProductCandidates(FIXTURE_HTML, SEARCH_PAGE_URL, {
    domain: "example-retailer.com",
  });
  const shirt = results.find((r) => r.url.includes("50512345"));
  const jacket = results.find((r) => r.url.includes("50567890"));
  const plain = results.find((r) => r.url.includes("999111"));

  assert.equal(shirt!.title, "Style 50512345 Black Shirt"); // from img alt
  assert.equal(jacket!.title, "Navy Jacket 50567890"); // from aria-label
  assert.equal(plain!.title, "Plain text tile title"); // from link text
});

test("respects maxCandidates", () => {
  const results = extractProductCandidates(FIXTURE_HTML, SEARCH_PAGE_URL, {
    domain: "example-retailer.com",
    maxCandidates: 1,
  });
  assert.equal(results.length, 1);
});

test("an optional per-site productUrlPattern overrides the generic heuristic", () => {
  const onlyDotHtml = extractProductCandidates(FIXTURE_HTML, SEARCH_PAGE_URL, {
    domain: "example-retailer.com",
    productUrlPattern: /\.html$/,
  });
  assert.equal(onlyDotHtml.length, 1);
  assert.ok(onlyDotHtml[0].url.endsWith(".html"));
});

test("de-dupes repeated links to the same product", () => {
  const html = `
    <a href="/p/1/thing">Thing</a>
    <a href="/p/1/thing">Thing again</a>
  `;
  const results = extractProductCandidates(html, SEARCH_PAGE_URL, { domain: "example-retailer.com" });
  assert.equal(results.length, 1);
});

test("returns an empty array for a page with no product-shaped links (a legitimate zero-results page)", () => {
  const html = `<div>No results found for your search.</div>`;
  const results = extractProductCandidates(html, SEARCH_PAGE_URL, { domain: "example-retailer.com" });
  assert.deepEqual(results, []);
});
