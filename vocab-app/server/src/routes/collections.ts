import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { LOCAL_USER_ID } from "../modules/users/localUser.js";
import { listVocabulary } from "../modules/vocabulary-bank/service.js";
import {
  addWordToCollection,
  createCollection,
  deleteCollection,
  listCollections,
  removeWordFromCollection,
  updateCollection,
} from "../modules/vocabulary-bank/collections.js";

export const collectionsRouter = Router();

collectionsRouter.get("/", (_req, res) => {
  res.json(listCollections(db, LOCAL_USER_ID));
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

collectionsRouter.post("/", (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });
    return;
  }
  try {
    const result = createCollection(db, LOCAL_USER_ID, parsed.data.name, parsed.data.description);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not create the collection." });
  }
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
});

collectionsRouter.patch("/:collectionId", (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });
    return;
  }
  try {
    updateCollection(db, LOCAL_USER_ID, req.params.collectionId, parsed.data);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not update the collection." });
  }
});

collectionsRouter.delete("/:collectionId", (req, res) => {
  try {
    deleteCollection(db, LOCAL_USER_ID, req.params.collectionId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not delete the collection." });
  }
});

const listQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["new", "learning", "familiar", "mastered"]).optional(),
  sort: z.enum(["recent", "reviewed", "nextReview", "mastery", "alphabetical", "difficult", "forgotten"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

collectionsRouter.get("/:collectionId/words", (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters.", details: parsed.error.flatten() });
    return;
  }
  const result = listVocabulary(db, LOCAL_USER_ID, { ...parsed.data, collectionId: req.params.collectionId });
  res.json(result);
});

const addWordSchema = z.object({ userVocabularyId: z.string().min(1) });

collectionsRouter.post("/:collectionId/words", (req, res) => {
  const parsed = addWordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });
    return;
  }
  try {
    addWordToCollection(db, LOCAL_USER_ID, req.params.collectionId, parsed.data.userVocabularyId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not add the word to the collection." });
  }
});

collectionsRouter.delete("/:collectionId/words/:userVocabularyId", (req, res) => {
  try {
    removeWordFromCollection(db, LOCAL_USER_ID, req.params.collectionId, req.params.userVocabularyId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not remove the word from the collection." });
  }
});
