import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { LOCAL_USER_ID } from "../modules/users/localUser.js";
import { recordReview, recordDontKnow } from "../modules/learning/reviewService.js";
import { getLearningQueue, getDueReviews, getLearningStats } from "../modules/learning/queueService.js";
import {
  startSession,
  getSessionInfo,
  getCurrentQuestion,
  submitAnswer,
  submitOutcome,
  completeSession,
  exitSession,
  startDifficultWordsSession,
} from "../modules/learning/sessionService.js";

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

// ============================================================
// Learning sessions (Phase 6). Ownership (LOCAL_USER_ID) is enforced by
// sessionService itself - every function loads the session scoped to the
// requesting user and throws if it doesn't belong to them.
// ============================================================

const startSessionSchema = z.object({
  type: z.enum(["daily_review", "new_words", "focused_word"]),
  wordId: z.string().min(1).optional(),
});

learningRouter.post("/sessions", (req, res) => {
  const parsed = startSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });
    return;
  }
  try {
    const result = startSession(db, LOCAL_USER_ID, parsed.data);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not start this session." });
  }
});

learningRouter.get("/sessions/:sessionId", (req, res) => {
  try {
    res.json(getSessionInfo(db, LOCAL_USER_ID, req.params.sessionId));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Session not found." });
  }
});

learningRouter.get("/sessions/:sessionId/current", (req, res) => {
  try {
    const question = getCurrentQuestion(db, LOCAL_USER_ID, req.params.sessionId);
    if (!question) {
      res.status(404).json({ error: "No current question - the session may already be complete." });
      return;
    }
    res.json({ question });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Session not found." });
  }
});

// The client may only ever submit what it typed/selected and an optional
// response time - never masteryScore/status/interval/nextReviewAt/
// easeFactor/needsReview. The Zod schema has no such fields, so there is
// structurally nothing for a client to inject here.
const submitAnswerSchema = z.object({
  submittedText: z.string().nullable(),
  responseTimeMs: z.number().int().nonnegative().optional(),
});

learningRouter.post("/sessions/:sessionId/answer", (req, res) => {
  const parsed = submitAnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid answer payload.", details: parsed.error.flatten() });
    return;
  }
  try {
    const result = submitAnswer(db, LOCAL_USER_ID, req.params.sessionId, parsed.data);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not submit this answer." });
  }
});

const submitOutcomeSchema = z.object({ outcome: z.enum(["hard", "good", "easy"]) });

learningRouter.post("/sessions/:sessionId/outcome", (req, res) => {
  const parsed = submitOutcomeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });
    return;
  }
  try {
    const result = submitOutcome(db, LOCAL_USER_ID, req.params.sessionId, parsed.data);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not record that outcome." });
  }
});

learningRouter.post("/sessions/:sessionId/complete", (req, res) => {
  try {
    res.json(completeSession(db, LOCAL_USER_ID, req.params.sessionId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not complete this session." });
  }
});

learningRouter.post("/sessions/:sessionId/exit", (req, res) => {
  try {
    res.json(exitSession(db, LOCAL_USER_ID, req.params.sessionId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not exit this session." });
  }
});

learningRouter.post("/sessions/:sessionId/review-difficult", (req, res) => {
  try {
    const result = startDifficultWordsSession(db, LOCAL_USER_ID, req.params.sessionId);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not start a difficult-words session." });
  }
});
