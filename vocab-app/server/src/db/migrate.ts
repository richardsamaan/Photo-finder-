import { sqlite } from "./client.js";

// Hand-written, idempotent SQL migrations (same pattern as the main app).
// Phase 2 adds the vocabulary schema's CREATE TABLE statements here.
const statements: string[] = [];

export function runMigrations() {
  const run = sqlite.transaction(() => {
    for (const stmt of statements) sqlite.exec(stmt);
  });
  run();
  console.log("[vocab-app db] migrations applied");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
  process.exit(0);
}
