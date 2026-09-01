import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { statements } from "./schemaSql.js";

// Isolated in-memory database for tests - same DDL as production
// (via schemaSql.ts), zero file-system or env side effects.
export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  for (const stmt of statements) sqlite.exec(stmt);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
