import { test } from "node:test";
import assert from "node:assert/strict";
import { env } from "../../env.js";
import { politeDelay, resetPoliteness } from "./politeness.js";

test.beforeEach(() => {
  resetPoliteness();
});

test("the first request to a domain is not delayed", async () => {
  env.SITE_SEARCH_DELAY_MS = 5000; // would fail this test if the first call waited
  const start = Date.now();
  await politeDelay("example.com");
  assert.ok(Date.now() - start < 200, "first request to a fresh domain should not be delayed");
});

test("a second request to the same domain waits out the configured delay", async () => {
  env.SITE_SEARCH_DELAY_MS = 150;
  await politeDelay("example.com");
  const start = Date.now();
  await politeDelay("example.com");
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 130, `expected to wait ~150ms, only waited ${elapsed}ms`);
});

test("delays are tracked per domain - a different domain is not held up by another's delay", async () => {
  env.SITE_SEARCH_DELAY_MS = 5000;
  await politeDelay("a.com");
  const start = Date.now();
  await politeDelay("b.com"); // different domain, should not wait on a.com's timer
  assert.ok(Date.now() - start < 200, "a different domain should not be delayed by another site's timer");
});
