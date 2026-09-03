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

  // --- Search provider selection ---
  // One of: google_cse | firecrawl | serpapi | bing | none
  SEARCH_PROVIDER: (process.env.SEARCH_PROVIDER ?? "none").toLowerCase(),

  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? "",
  GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID ?? "",

  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY ?? "",

  SERPAPI_API_KEY: process.env.SERPAPI_API_KEY ?? "",

  BING_API_KEY: process.env.BING_API_KEY ?? "",

  // --- Processing controls ---
  SEARCH_CONCURRENCY: num("SEARCH_CONCURRENCY", 3),
  SEARCH_RATE_LIMIT_MS: num("SEARCH_RATE_LIMIT_MS", 600), // min gap between provider requests
  SEARCH_MAX_RETRIES: num("SEARCH_MAX_RETRIES", 2),
  // Free-tier providers (e.g. Google Programmable Search) cap real queries per
  // 24h window (Google CSE: 100/day). Default leaves headroom under that cap
  // for the odd retried request - see services/quotaGovernor.ts.
  DAILY_SEARCH_QUOTA: num("DAILY_SEARCH_QUOTA", 95),
  FETCH_TIMEOUT_MS: num("FETCH_TIMEOUT_MS", 12000),
  MAX_UPLOAD_MB: num("MAX_UPLOAD_MB", 20),
  MAX_IMAGE_MB: num("MAX_IMAGE_MB", 15),

  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};

export const searchProviderConfigured = (): boolean => {
  switch (env.SEARCH_PROVIDER) {
    case "google_cse":
      return Boolean(env.GOOGLE_API_KEY && env.GOOGLE_CSE_ID);
    case "firecrawl":
      return Boolean(env.FIRECRAWL_API_KEY);
    case "serpapi":
      return Boolean(env.SERPAPI_API_KEY);
    case "bing":
      return Boolean(env.BING_API_KEY);
    default:
      return false;
  }
};
