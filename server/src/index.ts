import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { env, searchProviderConfigured } from "./env.js";
import { runMigrations } from "./db/migrate.js";
import { importRouter } from "./routes/import.js";
import { jobsRouter } from "./routes/jobs.js";
import { productsRouter } from "./routes/products.js";
import { exportRouter } from "./routes/export.js";
import { cacheRouter } from "./routes/cache.js";
import { quickSearchRouter } from "./routes/quickSearch.js";
import { isSearchConfigured } from "./services/searchProviders/index.js";

runMigrations();

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "2mb" }));

const catalogStaticDir = path.join(env.STORAGE_DIR, "catalog");
if (!fs.existsSync(catalogStaticDir)) fs.mkdirSync(catalogStaticDir, { recursive: true });
app.use("/storage/catalog", express.static(catalogStaticDir));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    searchProvider: env.SEARCH_PROVIDER,
    searchConfigured: isSearchConfigured(),
  });
});

app.use("/api/import", importRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/products", productsRouter);
app.use("/api/export", exportRouter);
app.use("/api/cache", cacheRouter);
app.use("/api/quick-search", quickSearchRouter);

// Serve the built frontend in production (single-process deployment).
const webDist = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "web", "dist");
if (env.NODE_ENV === "production" && fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (err?.message?.includes("File too large") || err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large." });
  }
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error." });
});

app.listen(env.PORT, () => {
  console.log(`[server] listening on http://localhost:${env.PORT}`);
  console.log(`[server] search provider: ${env.SEARCH_PROVIDER} (configured: ${searchProviderConfigured()})`);
});
