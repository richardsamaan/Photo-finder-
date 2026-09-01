import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { LOCAL_USER_ID } from "../modules/users/localUser.js";
import { startAssessment, submitAnswer } from "../modules/assessment/service.js";

export const assessmentRouter = Router();

assessmentRouter.post("/", (_req, res) => {
  try {
    const started = startAssessment(db, LOCAL_USER_ID);
    res.json(started);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not start the assessment." });
  }
});

const answerSchema = z.object({
  wordId: z.string().min(1),
  selectedOptionText: z.string().min(1).nullable(),
  responseTimeMs: z.number().int().nonnegative().optional(),
});

assessmentRouter.post("/:sessionId/answer", (req, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid answer payload.", details: parsed.error.flatten() });
    return;
  }

  try {
    const result = submitAnswer(db, req.params.sessionId, parsed.data);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not submit the answer." });
  }
});
