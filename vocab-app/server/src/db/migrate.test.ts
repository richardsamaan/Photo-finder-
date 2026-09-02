import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureColumn } from "./migrate.js";

test("ensureColumn adds a missing column without disturbing existing rows", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
  db.prepare("INSERT INTO t (id, name) VALUES (?, ?)").run("1", "Alice");

  ensureColumn(db, "t", "age", "age INTEGER NOT NULL DEFAULT 0");

  const row = db.prepare("SELECT * FROM t WHERE id = ?").get("1") as { name: string; age: number };
  assert.equal(row.name, "Alice");
  assert.equal(row.age, 0);
});

test("ensureColumn is idempotent - calling it twice does not error or duplicate the column", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (id TEXT PRIMARY KEY)");

  ensureColumn(db, "t", "age", "age INTEGER NOT NULL DEFAULT 0");
  assert.doesNotThrow(() => ensureColumn(db, "t", "age", "age INTEGER NOT NULL DEFAULT 0"));

  const columns = db.prepare("PRAGMA table_info(t)").all() as { name: string }[];
  assert.equal(columns.filter((c) => c.name === "age").length, 1);
});

test("ensureColumn does not touch an already-present column's existing values", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, age INTEGER NOT NULL DEFAULT 5)");
  db.prepare("INSERT INTO t (id, age) VALUES (?, ?)").run("1", 42);

  ensureColumn(db, "t", "age", "age INTEGER NOT NULL DEFAULT 0");

  const row = db.prepare("SELECT * FROM t WHERE id = ?").get("1") as { age: number };
  assert.equal(row.age, 42);
});

test("upgrading a pre-Phase-5 vocabulary_review_history table preserves existing rows and adds the new SRS columns", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  // Minimal legacy shape: only the Phase 2 columns, none of Phase 5's.
  db.exec(`CREATE TABLE vocabulary_review_history (
    id TEXT PRIMARY KEY,
    user_vocabulary_id TEXT NOT NULL,
    test_type TEXT NOT NULL,
    result TEXT NOT NULL,
    previous_score INTEGER NOT NULL,
    new_score INTEGER NOT NULL,
    response_time_ms INTEGER,
    reviewed_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`);
  db.prepare(
    `INSERT INTO vocabulary_review_history (id, user_vocabulary_id, test_type, result, previous_score, new_score)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run("hist_1", "uv_1", "recognition", "correct", 0, 20);

  ensureColumn(db, "vocabulary_review_history", "outcome", "outcome TEXT NOT NULL DEFAULT 'good'");
  ensureColumn(db, "vocabulary_review_history", "previous_interval_days", "previous_interval_days INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "vocabulary_review_history", "new_interval_days", "new_interval_days INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "vocabulary_review_history", "ease_factor", "ease_factor REAL NOT NULL DEFAULT 2.5");
  ensureColumn(db, "vocabulary_review_history", "repetitions", "repetitions INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "vocabulary_review_history", "next_review_at", "next_review_at TEXT");
  ensureColumn(db, "vocabulary_review_history", "was_due", "was_due INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "vocabulary_review_history", "successful", "successful INTEGER NOT NULL DEFAULT 0");

  const row = db.prepare("SELECT * FROM vocabulary_review_history WHERE id = ?").get("hist_1") as Record<string, unknown>;
  // Pre-existing data is completely untouched, even the now-retired test_type value.
  assert.equal(row.test_type, "recognition");
  assert.equal(row.previous_score, 0);
  assert.equal(row.new_score, 20);
  // New columns exist with sensible backfilled defaults.
  assert.equal(row.outcome, "good");
  assert.equal(row.previous_interval_days, 0);
  assert.equal(row.ease_factor, 2.5);
  assert.equal(row.was_due, 0);
  assert.equal(row.successful, 0);
});

test("upgrading a pre-Phase-6 learning_sessions table preserves existing rows and adds the session-lifecycle columns", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  // Minimal legacy shape: only the Phase 2 columns.
  db.exec(`CREATE TABLE learning_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (current_timestamp),
    completed_at TEXT,
    new_words_count INTEGER NOT NULL DEFAULT 0,
    review_words_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER
  )`);
  db.prepare(`INSERT INTO learning_sessions (id, user_id, new_words_count) VALUES (?, ?, ?)`).run(
    "session_1",
    "user_1",
    5
  );

  ensureColumn(db, "learning_sessions", "type", "type TEXT NOT NULL DEFAULT 'daily_review'");
  ensureColumn(db, "learning_sessions", "status", "status TEXT NOT NULL DEFAULT 'in_progress'");
  ensureColumn(db, "learning_sessions", "items_json", "items_json TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "learning_sessions", "current_index", "current_index INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "learning_sessions", "pending_correct", "pending_correct INTEGER");

  const row = db.prepare("SELECT * FROM learning_sessions WHERE id = ?").get("session_1") as Record<string, unknown>;
  assert.equal(row.new_words_count, 5, "pre-existing data untouched");
  assert.equal(row.type, "daily_review");
  assert.equal(row.status, "in_progress");
  assert.equal(row.items_json, "[]");
  assert.equal(row.current_index, 0);
  assert.equal(row.pending_correct, null);
});

test("upgrading a pre-Phase-6 vocabulary_review_history table adds a nullable learning_session_id without disturbing existing rows", () => {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE vocabulary_review_history (
    id TEXT PRIMARY KEY,
    user_vocabulary_id TEXT NOT NULL,
    test_type TEXT NOT NULL,
    result TEXT NOT NULL,
    previous_score INTEGER NOT NULL,
    new_score INTEGER NOT NULL
  )`);
  db.prepare(
    `INSERT INTO vocabulary_review_history (id, user_vocabulary_id, test_type, result, previous_score, new_score)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run("hist_1", "uv_1", "multiple_choice", "correct", 0, 20);

  ensureColumn(db, "vocabulary_review_history", "learning_session_id", "learning_session_id TEXT");

  const row = db.prepare("SELECT * FROM vocabulary_review_history WHERE id = ?").get("hist_1") as Record<string, unknown>;
  assert.equal(row.new_score, 20);
  assert.equal(row.learning_session_id, null);
});
