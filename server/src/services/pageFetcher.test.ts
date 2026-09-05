import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchProductPage } from "./pageFetcher.js";

const PAGE_URL = "https://www.example-retailer.com/product/50512345";

const realFetch = globalThis.fetch;
test.after(() => {
  globalThis.fetch = realFetch;
});

/** Routes robots.txt requests to an allow-all response, everything else to `html`. */
function mockPageFetch(html: string, contentType = "text/html") {
  globalThis.fetch = (async (url: string) => {
    if (url.toString().endsWith("/robots.txt")) {
      return new Response("", { status: 404 });
    }
    return new Response(html, { status: 200, headers: { "content-type": contentType } });
  }) as typeof fetch;
}

test("og:image is preferred when present", async () => {
  mockPageFetch(`
    <html><head>
      <meta property="og:image" content="/images/main.jpg" />
    </head><body>
      <img src="/images/logo.jpg" alt="logo" />
    </body></html>
  `);
  const page = await fetchProductPage(PAGE_URL);
  assert.equal(page?.images[0]?.url, "https://www.example-retailer.com/images/main.jpg");
  assert.equal(page?.images[0]?.alt, "og:image");
});

test("falls back to schema.org JSON-LD Product.image when there is no og:image", async () => {
  mockPageFetch(`
    <html><head>
      <script type="application/ld+json">
        { "@context": "https://schema.org", "@type": "Product", "name": "Shirt", "image": "/images/ld-image.jpg" }
      </script>
    </head><body>
      <img src="/images/logo.jpg" alt="logo" />
    </body></html>
  `);
  const page = await fetchProductPage(PAGE_URL);
  assert.equal(page?.images[0]?.url, "https://www.example-retailer.com/images/ld-image.jpg");
});

test("JSON-LD image can be an array or an ImageObject, not just a bare string", async () => {
  mockPageFetch(`
    <html><head>
      <script type="application/ld+json">
        { "@type": "Product", "image": [{ "url": "/images/first.jpg" }, "/images/second.jpg"] }
      </script>
    </head><body></body></html>
  `);
  const page = await fetchProductPage(PAGE_URL);
  assert.equal(page?.images[0]?.url, "https://www.example-retailer.com/images/first.jpg");
});

test("falls back to a common product-gallery selector when there's no og:image or JSON-LD", async () => {
  mockPageFetch(`
    <html><body>
      <img src="/images/nav-icon.jpg" alt="menu" />
      <div class="product-gallery">
        <img src="/images/gallery-main.jpg" alt="Product photo" />
      </div>
    </body></html>
  `);
  const page = await fetchProductPage(PAGE_URL);
  assert.equal(page?.images[0]?.url, "https://www.example-retailer.com/images/gallery-main.jpg");
});

test("falls back to any image on the page as a last resort", async () => {
  mockPageFetch(`<html><body><img src="/images/whatever.jpg" alt="thing" /></body></html>`);
  const page = await fetchProductPage(PAGE_URL);
  assert.equal(page?.images[0]?.url, "https://www.example-retailer.com/images/whatever.jpg");
});

test("malformed JSON-LD is ignored rather than failing the whole page fetch", async () => {
  mockPageFetch(`
    <html><head>
      <script type="application/ld+json">{ this is not valid JSON </script>
    </head><body>
      <meta property="og:image" content="/images/main.jpg" />
    </body></html>
  `);
  const page = await fetchProductPage(PAGE_URL);
  assert.ok(page); // did not throw
});

test("extracts page text from title/meta/headings/body", async () => {
  mockPageFetch(`
    <html><head><title>Black Shirt 50512345</title>
      <meta name="description" content="A great shirt" />
    </head><body><h1>Black Shirt</h1></body></html>
  `);
  const page = await fetchProductPage(PAGE_URL);
  assert.ok(page?.text.includes("Black Shirt 50512345"));
  assert.ok(page?.text.includes("A great shirt"));
});

test("returns null for a non-HTML response", async () => {
  globalThis.fetch = (async (url: string) => {
    if (url.toString().endsWith("/robots.txt")) return new Response("", { status: 404 });
    return new Response(Buffer.from([0xff, 0xd8]), { status: 200, headers: { "content-type": "image/jpeg" } });
  }) as typeof fetch;
  const page = await fetchProductPage(PAGE_URL);
  assert.equal(page, null);
});
