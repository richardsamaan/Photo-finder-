import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");

// Load the repo-root .env explicitly - "dotenv/config" defaults to
// process.cwd(), which is server/ when run via `npm run dev -w server`,
// so it would silently miss the root .env entirely.
dotenv.config({ path: path.join(repoRoot, ".env") });

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  PORT: num("PORT", 4000),
  NODE_ENV: process.env.NODE_ENV ?? "development",

  DATABASE_PATH: process.env.DATABASE_PATH
    ? path.resolve(repoRoot, process.env.DATABASE_PATH)
    : path.join(serverRoot, "data", "app.db"),

  STORAGE_DIR: process.env.STORAGE_DIR
    ? path.resolve(repoRoot, process.env.STORAGE_DIR)
    : path.join(repoRoot, "storage"),

  // --- Processing controls ---
  SEARCH_CONCURRENCY: num("SEARCH_CONCURRENCY", 3), // parallel products processed at once
  // Minimum gap between two requests to the *same* retailer site (politeness,
  // not cost - there is no external API/quota in the direct-site-search model).
  SITE_SEARCH_DELAY_MS: num("SITE_SEARCH_DELAY_MS", 1500),
  SITE_SEARCH_MAX_RETRIES: num("SITE_SEARCH_MAX_RETRIES", 1),
  FETCH_TIMEOUT_MS: num("FETCH_TIMEOUT_MS", 12000),
  MAX_UPLOAD_MB: num("MAX_UPLOAD_MB", 20),
  MAX_IMAGE_MB: num("MAX_IMAGE_MB", 15),

  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};
