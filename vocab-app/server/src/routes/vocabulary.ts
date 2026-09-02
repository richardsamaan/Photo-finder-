import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { LOCAL_USER_ID } from "../modules/users/localUser.js";
import { getEnglishLanguageId } from "../modules/dictionary/language.js";
import { addWord, getSummary, getWordDetail, listVocabulary } from "../modules/vocabulary-bank/service.js";
import { recordDontKnow } from "../modules/learning/reviewService.js";

export const vocabularyRouter = Router();

const listQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["new", "learning", "familiar", "mastered"]).optional(),
  needsReview: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  known: z.enum(["known_before_app", "learned_through_app"]).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  collectionId: z.string().min(1).optional(),
  sort: z.enum(["recent", "reviewed", "nextReview", "mastery", "alphabetical", "difficult", "forgotten"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

vocabularyRouter.get("/", (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters.", details: parsed.error.flatten() });
    return;
  }
  const result = listVocabulary(db, LOCAL_USER_ID, parsed.data);
  res.json(result);
});

vocabularyRouter.get("/summary", (_req, res) => {
  const summary = getSummary(db, LOCAL_USER_ID);
  res.json(summary);
});

const addWordSchema = z.object({ word: z.string().trim().min(1).max(100) });

vocabularyRouter.post("/words", (req, res) => {
  const parsed = addWordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });
    return;
  }
  try {
    const languageId = getEnglishLanguageId(db);
    const result = addWord(db, LOCAL_USER_ID, languageId, parsed.data.word);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not add the word." });
  }
});

const dontKnowSchema = z.object({ wordId: z.string().min(1) });

vocabularyRouter.post("/dont-know", (req, res) => {
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

// Kept last: a param route would otherwise shadow the static routes above.
vocabularyRouter.get("/:userVocabularyId", (req, res) => {
  const detail = getWordDetail(db, LOCAL_USER_ID, req.params.userVocabularyId);
  if (!detail) {
    res.status(404).json({ error: "Word not found in your vocabulary." });
    return;
  }
  res.json(detail);
});
