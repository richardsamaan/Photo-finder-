import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeBotBlock } from "./botCheck.js";

test("flags common block/rate-limit status codes regardless of body", () => {
  assert.equal(looksLikeBotBlock(403, "<html>whatever</html>"), true);
  assert.equal(looksLikeBotBlock(429, ""), true);
  assert.equal(looksLikeBotBlock(503, "<html>maintenance</html>"), true);
});

test("does not flag a normal 200 response with ordinary content", () => {
  assert.equal(looksLikeBotBlock(200, "<html><body>3 results found</body></html>"), false);
});

test("flags a 200 response whose body is a CAPTCHA/bot-check page", () => {
  assert.equal(looksLikeBotBlock(200, "<html><body>Please verify you are a human - CAPTCHA</body></html>"), true);
  assert.equal(looksLikeBotBlock(200, "<title>Pardon Our Interruption</title>"), true);
  assert.equal(looksLikeBotBlock(200, "Access Denied"), true);
});

test("is case-insensitive", () => {
  assert.equal(looksLikeBotBlock(200, "ACCESS DENIED"), true);
});

test("a legitimate empty-results page is not mistaken for a block", () => {
  assert.equal(looksLikeBotBlock(200, "<html><body>No results found for '50512345'.</body></html>"), false);
});
