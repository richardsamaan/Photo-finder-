import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// node:test runs each *.test.ts file in its own process, so it's safe to
// point DATABASE_PATH at a throwaway file before importing anything that
// touches the DB - this must not run against the real dev/app database.
const tmpDb = path.join(os.tmpdir(), `quota-governor-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = tmpDb;
process.env.DAILY_SEARCH_QUOTA = "5";

const { runMigrations } = await import("../db/migrate.js");
const { sqlite } = await import("../db/client.js");
runMigrations();

const { getQuotaStatus, hasQuotaFor, consumeQuota } = await import("./quotaGovernor.js");

test.after(() => {
  sqlite.close();
  for (const f of [tmpDb, `${tmpDb}-wal`, `${tmpDb}-shm`]) {
    fs.rmSync(f, { force: true });
  }
});

test("starts with the full configured cap available", () => {
  const status = getQuotaStatus();
  assert.equal(status.cap, 5);
  assert.equal(status.used, 0);
  assert.equal(status.remaining, 5);
});

test("consumeQuota decrements remaining budget", () => {
  consumeQuota(2);
  const status = getQuotaStatus();
  assert.equal(status.used, 2);
  assert.equal(status.remaining, 3);
});

test("hasQuotaFor enforces the cap", () => {
  assert.equal(hasQuotaFor(3), true);
  assert.equal(hasQuotaFor(4), false);
  consumeQuota(3); // now at cap (5/5)
  assert.equal(hasQuotaFor(1), false);
  assert.equal(getQuotaStatus().remaining, 0);
});

test("consuming beyond the cap never goes negative-remaining", () => {
  consumeQuota(10); // way over cap - simulates retry overspend
  const status = getQuotaStatus();
  assert.equal(status.remaining, 0);
  assert.equal(hasQuotaFor(1), false);
});

test("the window resets automatically 24h later, restoring full budget (resume-next-day behaviour)", () => {
  // Simulate "yesterday" by rewriting window_start directly, the same way a
  // resumed job the next calendar day would find it.
  const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  sqlite.prepare(`UPDATE search_quota SET window_start = ?`).run(twentyFiveHoursAgo);

  const status = getQuotaStatus();
  assert.equal(status.used, 0);
  assert.equal(status.remaining, 5);
  assert.equal(hasQuotaFor(5), true);
});

test("a window less than 24h old does not reset", () => {
  consumeQuota(1);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  sqlite.prepare(`UPDATE search_quota SET window_start = ?`).run(oneHourAgo);

  const status = getQuotaStatus();
  assert.equal(status.used, 1);
  assert.equal(status.remaining, 4);
});
