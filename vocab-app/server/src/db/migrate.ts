import { sqlite } from "./client.js";
import { statements } from "./schemaSql.js";

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
