import type Database from "better-sqlite3";
import { sqlite } from "./client.js";
import { statements } from "./schemaSql.js";

// SQLite has no "ADD COLUMN IF NOT EXISTS" - this makes adding a column to
// an already-existing table idempotent, for databases created before that
// column existed. Fresh databases already get the column via the
// CREATE TABLE statement above, so this is purely an upgrade path.
// Takes an explicit db handle (rather than the module-level singleton) so
// it can be exercised in tests against an isolated in-memory database.
export function ensureColumn(db: Database.Database, table: string, column: string, columnDefinition: string) {
  const existingColumns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!existingColumns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`);
  }
}

export function runMigrations() {
  const run = sqlite.transaction(() => {
    for (const stmt of statements) sqlite.exec(stmt);

    ensureColumn(sqlite, "user_vocabulary", "known_before_app", "known_before_app INTEGER NOT NULL DEFAULT 0");

    // Phase 5: mastery + spaced-repetition engine columns. This table was
    // never written to before Phase 5, so backfilled defaults on existing
    // (always-empty) rows carry no real data-loss risk.
    ensureColumn(sqlite, "vocabulary_review_history", "outcome", "outcome TEXT NOT NULL DEFAULT 'good'");
    ensureColumn(
      sqlite,
      "vocabulary_review_history",
      "previous_interval_days",
      "previous_interval_days INTEGER NOT NULL DEFAULT 0"
    );
    ensureColumn(sqlite, "vocabulary_review_history", "new_interval_days", "new_interval_days INTEGER NOT NULL DEFAULT 0");
    ensureColumn(sqlite, "vocabulary_review_history", "ease_factor", "ease_factor REAL NOT NULL DEFAULT 2.5");
    ensureColumn(sqlite, "vocabulary_review_history", "repetitions", "repetitions INTEGER NOT NULL DEFAULT 0");
    ensureColumn(sqlite, "vocabulary_review_history", "next_review_at", "next_review_at TEXT");
    ensureColumn(sqlite, "vocabulary_review_history", "was_due", "was_due INTEGER NOT NULL DEFAULT 0");
    ensureColumn(sqlite, "vocabulary_review_history", "successful", "successful INTEGER NOT NULL DEFAULT 0");

    // Phase 6: session lifecycle columns. Both tables were never written
    // to before Phase 6 (learning_sessions since Phase 2, the new link
    // column on vocabulary_review_history is brand new), so these
    // backfills carry no real data-loss risk either.
    ensureColumn(sqlite, "learning_sessions", "type", "type TEXT NOT NULL DEFAULT 'daily_review'");
    ensureColumn(sqlite, "learning_sessions", "status", "status TEXT NOT NULL DEFAULT 'in_progress'");
    ensureColumn(sqlite, "learning_sessions", "items_json", "items_json TEXT NOT NULL DEFAULT '[]'");
    ensureColumn(sqlite, "learning_sessions", "current_index", "current_index INTEGER NOT NULL DEFAULT 0");
    ensureColumn(sqlite, "learning_sessions", "pending_correct", "pending_correct INTEGER");
    ensureColumn(sqlite, "vocabulary_review_history", "learning_session_id", "learning_session_id TEXT");
  });
  run();
  console.log("[vocab-app db] migrations applied");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
  process.exit(0);
}
