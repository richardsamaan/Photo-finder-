import { sqlite } from "./client.js";
import { statements } from "./schemaSql.js";

// SQLite has no "ADD COLUMN IF NOT EXISTS" - this makes adding a column to
// an already-existing table idempotent, for databases created before that
// column existed. Fresh databases already get the column via the
// CREATE TABLE statement above, so this is purely an upgrade path.
function ensureColumn(table: string, column: string, columnDefinition: string) {
  const existingColumns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!existingColumns.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`);
  }
}

export function runMigrations() {
  const run = sqlite.transaction(() => {
    for (const stmt of statements) sqlite.exec(stmt);
    ensureColumn("user_vocabulary", "known_before_app", "known_before_app INTEGER NOT NULL DEFAULT 0");
  });
  run();
  console.log("[vocab-app db] migrations applied");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
  process.exit(0);
}
