import { test } from "node:test";
import assert from "node:assert/strict";
import { runSiteSearch } from "./index.js";
import { resetSiteHealth, getSiteHealthSnapshot } from "./health.js";
import { resetPoliteness } from "./politeness.js";
import type { SearchProvider } from "./types.js";

function fakeAdapter(name: string, behavior: (query: string) => Promise<any[]>): SearchProvider {
  return { name, isConfigured: () => true, search: behavior };
}

test.beforeEach(() => {
  resetSiteHealth();
  resetPoliteness();
});

test("fans a query out to every adapter and aggregates results", async () => {
  const a = fakeAdapter("a.com", async () => [{ url: "https://a.com/1", title: "A1", snippet: "", domain: "a.com" }]);
  const b = fakeAdapter("b.com", async () => [{ url: "https://b.com/1", title: "B1", snippet: "", domain: "b.com" }]);

  const { results } = await runSiteSearch("50512345", { adapters: [a, b] });
  assert.equal(results.length, 2);
  assert.ok(results.some((r) => r.domain === "a.com"));
  assert.ok(results.some((r) => r.domain === "b.com"));
});

test("a failing adapter is skipped, not fatal to the run", async () => {
  const ok = fakeAdapter("ok.com", async () => [{ url: "https://ok.com/1", title: "", snippet: "", domain: "ok.com" }]);
  const broken = fakeAdapter("broken.com", async () => {
    throw new Error("blocked");
  });

  const { results } = await runSiteSearch("50512345", { adapters: [ok, broken] });
  assert.equal(results.length, 1);
  assert.equal(results[0].domain, "ok.com");
});

test("records success/failure per site in health tracking", async () => {
  const ok = fakeAdapter("ok.com", async () => [{ url: "https://ok.com/1", title: "", snippet: "", domain: "ok.com" }]);
  const broken = fakeAdapter("broken.com", async () => {
    throw new Error("bot-check detected");
  });

  await runSiteSearch("50512345", { adapters: [ok, broken] });
  const health = getSiteHealthSnapshot();

  assert.equal(health["ok.com"].succeeded, 1);
  assert.equal(health["ok.com"].failed, 0);
  assert.equal(health["ok.com"].resultsReturned, 1);

  assert.equal(health["broken.com"].succeeded, 0);
  assert.equal(health["broken.com"].failed, 1);
  assert.equal(health["broken.com"].lastError, "bot-check detected");
});

test("a legitimate zero-results adapter still counts as a success", async () => {
  const empty = fakeAdapter("empty.com", async () => []);
  await runSiteSearch("50511111", { adapters: [empty] });
  const health = getSiteHealthSnapshot();
  assert.equal(health["empty.com"].succeeded, 1);
  assert.equal(health["empty.com"].resultsReturned, 0);
});

test("domainFilterMode: official_only restricts the fan-out to the official domain", async () => {
  const official = fakeAdapter("hugoboss.com", async () => [
    { url: "https://hugoboss.com/1", title: "", snippet: "", domain: "hugoboss.com" },
  ]);
  const other = fakeAdapter("farfetch.com", async () => [
    { url: "https://farfetch.com/1", title: "", snippet: "", domain: "farfetch.com" },
  ]);

  const { results } = await runSiteSearch("50512345", {
    adapters: [official, other],
    domainFilterMode: "official_only",
    officialDomain: "hugoboss.com",
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].domain, "hugoboss.com");
});

test("domainFilterMode: official_plus_allowlist also allows a curated retailer", async () => {
  const official = fakeAdapter("hugoboss.com", async () => [
    { url: "https://hugoboss.com/1", title: "", snippet: "", domain: "hugoboss.com" },
  ]);
  const allowlisted = fakeAdapter("endclothing.com", async () => [
    { url: "https://endclothing.com/1", title: "", snippet: "", domain: "endclothing.com" },
  ]);
  const excluded = fakeAdapter("random-boutique.com", async () => [
    { url: "https://random-boutique.com/1", title: "", snippet: "", domain: "random-boutique.com" },
  ]);

  const { results } = await runSiteSearch("50512345", {
    adapters: [official, allowlisted, excluded],
    domainFilterMode: "official_plus_allowlist",
    officialDomain: "hugoboss.com",
  });

  const domains = results.map((r) => r.domain).sort();
  assert.deepEqual(domains, ["endclothing.com", "hugoboss.com"]);
});

test("domainFilterMode: none searches every adapter", async () => {
  const a = fakeAdapter("a.com", async () => [{ url: "https://a.com/1", title: "", snippet: "", domain: "a.com" }]);
  const b = fakeAdapter("b.com", async () => [{ url: "https://b.com/1", title: "", snippet: "", domain: "b.com" }]);
  const { results } = await runSiteSearch("50512345", { adapters: [a, b], domainFilterMode: "none" });
  assert.equal(results.length, 2);
});
