import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createBrowserSiteAdapter, closeBrowser } from "./createBrowserSiteAdapter.js";

/**
 * A tiny local HTTP server standing in for a real retailer site - no live
 * network calls in the test suite, just real HTTP + a real headless
 * browser talking to localhost. The /listing route deliberately defers its
 * real content behind an in-page `fetch()` call (not a synchronous inline
 * script), so this only passes if the adapter actually waits for the
 * page's own network activity to settle before reading anything - the
 * exact gap a plain HTTP fetch can never close, and the reason
 * createBrowserSiteAdapter.ts exists (see its module doc and
 * extractProductCandidates.ts's farfetch.com write-up).
 */
function startTestServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/listing") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html><body>
            <nav><a href="/account/login">Sign in</a></nav>
            <div id="results">Loading...</div>
            <script>
              fetch('/api/results').then((r) => r.text()).then((html) => {
                document.getElementById('results').innerHTML = html;
              });
            </script>
          </body></html>
        `);
      } else if (url.pathname === "/api/results") {
        // Deliberately delayed so the page's initial (domcontentloaded)
        // state genuinely has no real product link yet when this fires.
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end('<a href="/p/7654321/real-product" aria-label="Real Product 7654321">Real Product</a>');
        }, 150);
      } else if (url.pathname === "/redirect") {
        res.writeHead(302, { Location: "/product/1234567" });
        res.end();
      } else if (url.pathname === "/product/1234567") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><head><title>Navy Jacket 1234567</title></head><body>Product page</body></html>");
      } else if (url.pathname === "/blocked") {
        res.writeHead(403, { "Content-Type": "text/html" });
        res.end("Please complete this CAPTCHA to continue");
      } else if (url.pathname === "/notfound") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("Not Found");
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

let server: { baseUrl: string; close: () => Promise<void> };

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  await server.close();
  await closeBrowser();
});

test("waits for the page's own client-side rendering and extracts the real product link a plain fetch would never see", async () => {
  const adapter = createBrowserSiteAdapter({
    domain: "127.0.0.1",
    buildSearchUrl: () => `${server.baseUrl}/listing`,
  });
  const results = await adapter.search("anything");
  assert.equal(results.length, 1);
  assert.ok(results[0].url.endsWith("/p/7654321/real-product"));
  assert.equal(results[0].title, "Real Product 7654321");
});

test("treats a redirect straight to a single product page as one candidate, not a listing to scan", async () => {
  const adapter = createBrowserSiteAdapter({
    domain: "127.0.0.1",
    buildSearchUrl: () => `${server.baseUrl}/redirect`,
    productUrlPattern: /\/product\/\d+$/,
  });
  const results = await adapter.search("anything");
  assert.equal(results.length, 1);
  assert.ok(results[0].url.endsWith("/product/1234567"));
  assert.equal(results[0].title, "Navy Jacket 1234567");
});

test("throws BLOCKED (not a silent empty result) on a bot-check response", async () => {
  const adapter = createBrowserSiteAdapter({ domain: "127.0.0.1", buildSearchUrl: () => `${server.baseUrl}/blocked` });
  await assert.rejects(() => adapter.search("anything"), /BLOCKED.*not a URL problem/);
});

test("throws a 404-specific message, distinguishing it from a block", async () => {
  const adapter = createBrowserSiteAdapter({ domain: "127.0.0.1", buildSearchUrl: () => `${server.baseUrl}/notfound` });
  await assert.rejects(() => adapter.search("anything"), /404.*URL pattern is likely wrong/);
});
