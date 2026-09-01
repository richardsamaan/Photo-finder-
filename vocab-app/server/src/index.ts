import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { env } from "./env.js";
import { runMigrations } from "./db/migrate.js";
import { healthRouter } from "./routes/health.js";
import { assessmentRouter } from "./routes/assessment.js";
import { ensureLocalUser } from "./modules/users/localUser.js";

runMigrations();
ensureLocalUser();

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "2mb" }));

app.use("/api/health", healthRouter);
app.use("/api/assessment", assessmentRouter);

// Serve the built frontend in production (single-process deployment).
const webDist = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "web", "dist");
if (env.NODE_ENV === "production" && fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error." });
});

app.listen(env.PORT, () => {
  console.log(`[vocab-app server] listening on http://localhost:${env.PORT}`);
  console.log(`[vocab-app server] AI provider: ${env.AI_PROVIDER}`);
});
