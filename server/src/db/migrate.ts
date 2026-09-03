import { sqlite } from "./client.js";

// Hand-written schema migration (no network-dependent codegen needed).
// Safe to run repeatedly - every statement is idempotent.
const statements = [
  `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    column_mapping TEXT,
    total_products INTEGER NOT NULL DEFAULT 0,
    processed_products INTEGER NOT NULL DEFAULT 0,
    concurrency INTEGER NOT NULL DEFAULT 3,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    job_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS categories_job_name_idx ON categories (job_id, name)`,
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    style_code TEXT NOT NULL,
    colour TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    confidence INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    source_url TEXT,
    source_name TEXT,
    local_image_path TEXT,
    filename TEXT,
    verification_notes TEXT,
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    manually_uploaded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE INDEX IF NOT EXISTS products_job_idx ON products (job_id)`,
  `CREATE INDEX IF NOT EXISTS products_status_idx ON products (job_id, status)`,
  `CREATE INDEX IF NOT EXISTS products_style_colour_idx ON products (style_code, colour)`,
  `CREATE TABLE IF NOT EXISTS search_results (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    query TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    snippet TEXT,
    domain TEXT NOT NULL,
    image_url TEXT,
    style_code_match INTEGER NOT NULL DEFAULT 0,
    colour_match INTEGER NOT NULL DEFAULT 0,
    category_match INTEGER NOT NULL DEFAULT 0,
    source_tier TEXT NOT NULL DEFAULT 'unknown',
    confidence INTEGER NOT NULL DEFAULT 0,
    evidence TEXT,
    chosen INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE INDEX IF NOT EXISTS search_results_product_idx ON search_results (product_id)`,
  `CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    search_result_id TEXT,
    source_url TEXT NOT NULL,
    local_path TEXT,
    width INTEGER,
    height INTEGER,
    verified INTEGER NOT NULL DEFAULT 0,
    chosen INTEGER NOT NULL DEFAULT 0,
    uploaded_manually INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE INDEX IF NOT EXISTS images_product_idx ON images (product_id)`,
  `CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL UNIQUE,
    tier TEXT NOT NULL DEFAULT 'unknown',
    trust_score INTEGER NOT NULL DEFAULT 50,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS search_history (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    query TEXT NOT NULL,
    provider TEXT NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0,
    success INTEGER NOT NULL DEFAULT 1,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE INDEX IF NOT EXISTS search_history_product_idx ON search_history (product_id)`,
  `CREATE TABLE IF NOT EXISTS search_cache (
    id TEXT PRIMARY KEY,
    cache_key TEXT NOT NULL UNIQUE,
    style_code TEXT NOT NULL,
    colour TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    source_url TEXT,
    source_name TEXT,
    results_json TEXT,
    created_at TEXT NOT NULL DEFAULT (current_timestamp),
    updated_at TEXT NOT NULL DEFAULT (current_timestamp)
  )`,
  `CREATE TABLE IF NOT EXISTS search_quota (
    id TEXT PRIMARY KEY,
    window_start TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0
  )`,
];

// SQLite has no "ADD COLUMN IF NOT EXISTS" - stay idempotent by checking
// PRAGMA table_info first, same spirit as the "CREATE ... IF NOT EXISTS"
// statements above.
function ensureColumn(table: string, column: string, columnDdl: string) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDdl}`);
  }
}

export function runMigrations() {
  const run = sqlite.transaction(() => {
    for (const stmt of statements) sqlite.exec(stmt);
  });
  run();

  ensureColumn("jobs", "domain_filter_mode", `domain_filter_mode TEXT NOT NULL DEFAULT 'none'`);
  ensureColumn("jobs", "official_domain", `official_domain TEXT`);
  ensureColumn("jobs", "pause_reason", `pause_reason TEXT`);
  ensureColumn("products", "season", `season TEXT`);
  ensureColumn("products", "search_phase", `search_phase INTEGER NOT NULL DEFAULT 0`);

  console.log("[db] migrations applied");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
  process.exit(0);
}
