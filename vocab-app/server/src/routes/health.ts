import { Router } from "express";
import { env, aiProviderConfigured } from "../env.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    app: "vocab-app",
    phase: 6,
    aiProvider: env.AI_PROVIDER,
    aiConfigured: aiProviderConfigured(),
  });
});
