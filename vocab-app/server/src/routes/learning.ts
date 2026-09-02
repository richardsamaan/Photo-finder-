import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { LOCAL_USER_ID } from "../modules/users/localUser.js";
import { recordReview, recordDontKnow } from "../modules/learning/reviewService.js";
import { getLearningQueue, getDueReviews, getLearningStats } from "../modules/learning/queueService.js";

export const learningRouter = Router();

const TEST_TYPES = [
  "english_to_meaning",
  "meaning_to_english",
  "multiple_choice",
  "fill_blank",
  "sentence_completion",
  "context_recognition",
  "spelling",
  "listening",
  "active_usage",
  "ai_conversation",
] as const;

const OUTCOMES = ["again", "hard", "good", "easy", "dont_know"] as const;

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

learningRouter.get("/queue", (req, res) => {
  const parsed = limitQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters.", details: parsed.error.flatten() });
    return;
  }
  const items = getLearningQueue(db, LOCAL_USER_ID, parsed.data.limit ?? 50);
  res.json({ items });
});

learningRouter.get("/due", (req, res) => {
  const parsed = limitQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters.", details: parsed.error.flatten() });
    return;
  }
  const items = getDueReviews(db, LOCAL_USER_ID, parsed.data.limit ?? 50);
  res.json({ items });
});

learningRouter.get("/stats", (_req, res) => {
  res.json(getLearningStats(db, LOCAL_USER_ID));
});

// Only userVocabularyId/testType/outcome/responseTimeMs are ever accepted
// here - mastery, status, interval, and next-review are always computed
// server-side by recordReview; there is no field a client could use to
// inject them.
const reviewSchema = z.object({
  userVocabularyId: z.string().min(1),
  testType: z.enum(TEST_TYPES),
  outcome: z.enum(OUTCOMES),
  responseTimeMs: z.number().int().nonnegative().optional(),
});

learningRouter.post("/review", (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid review payload.", details: parsed.error.flatten() });
    return;
  }
  try {
    const result = recordReview(db, LOCAL_USER_ID, parsed.data);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not record this review." });
  }
});

const dontKnowSchema = z.object({ wordId: z.string().min(1) });

learningRouter.post("/dont-know", (req, res) => {
  const parsed = dontKnowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });
    return;
  }
  try {
    const result = recordDontKnow(db, LOCAL_USER_ID, parsed.data.wordId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not update this word." });
  }
});
