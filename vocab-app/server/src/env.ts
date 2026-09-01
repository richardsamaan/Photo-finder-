import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const appRoot = path.resolve(serverRoot, "..");

// Load vocab-app/.env explicitly - "dotenv/config" defaults to
// process.cwd(), which is server/ when run via `npm run dev -w server`,
// so it would silently miss vocab-app/.env entirely.
dotenv.config({ path: path.join(appRoot, ".env") });

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  PORT: num("PORT", 4001),
  NODE_ENV: process.env.NODE_ENV ?? "development",

  DATABASE_PATH: process.env.DATABASE_PATH
    ? path.resolve(appRoot, process.env.DATABASE_PATH)
    : path.join(serverRoot, "data", "app.db"),

  STORAGE_DIR: process.env.STORAGE_DIR
    ? path.resolve(appRoot, process.env.STORAGE_DIR)
    : path.join(appRoot, "storage"),

  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5174",

  // --- AI provider selection (Phase 10+) ---
  // One of: anthropic | openai | gemini | none. Every core feature
  // (vocabulary bank, mastery, spaced repetition, testing, stats, export)
  // works with AI_PROVIDER=none - only AI Conversation and AI Content
  // Generation are gated on this.
  AI_PROVIDER: (process.env.AI_PROVIDER ?? "none").toLowerCase(),
};

export const aiProviderConfigured = (): boolean => {
  switch (env.AI_PROVIDER) {
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY);
    case "gemini":
      return Boolean(process.env.GEMINI_API_KEY);
    default:
      return false;
  }
};
