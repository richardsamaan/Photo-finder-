import { test } from "node:test";
import assert from "node:assert/strict";
import { eq, and } from "drizzle-orm";
import { createTestDb } from "../../db/testUtils.js";
import { seedEnglishLanguage, seedWords } from "../../db/seed.js";
import { users, words, userVocabulary, vocabularyCollections, collectionWords } from "../../db/schema.js";
import { newId } from "../../lib/ids.js";
import { upsertUserVocabulary } from "./service.js";
import {
  addWordToCollection,
  createCollection,
  deleteCollection,
  listCollections,
  removeWordFromCollection,
  updateCollection,
} from "./collections.js";

type TestDb = ReturnType<typeof createTestDb>["db"];

function setup() {
  const { db } = createTestDb();
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();
  const languageId = seedEnglishLanguage(db);
  seedWords(db, languageId);
  return { db, userId, languageId };
}

function wordIdFor(db: TestDb, languageId: string, normalized: string): string {
  const row = db
    .select()
    .from(words)
    .where(and(eq(words.languageId, languageId), eq(words.normalizedWord, normalized)))
    .get();
  if (!row) throw new Error(`fixture word "${normalized}" not seeded`);
  return row.id;
}

test("a collection can be created", () => {
  const { db, userId } = setup();
  const { id } = createCollection(db, userId, "Work");

  const collections = listCollections(db, userId);
  assert.equal(collections.length, 1);
  assert.equal(collections[0].id, id);
  assert.equal(collections[0].name, "Work");
  assert.equal(collections[0].wordCount, 0);
});

test("creating a collection with a duplicate name is rejected", () => {
  const { db, userId } = setup();
  createCollection(db, userId, "Work");
  assert.throws(() => createCollection(db, userId, "Work"));
});

test("a word can be added to a collection", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, achieveId, {
    status: "new",
    knownBeforeApp: false,
    masteryScore: 0,
    confidenceScore: 0,
  });
  const { id: collectionId } = createCollection(db, userId, "Work");

  addWordToCollection(db, userId, collectionId, userVocabularyId);

  const collections = listCollections(db, userId);
  assert.equal(collections[0].wordCount, 1);
});

test("a word can belong to multiple collections", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, achieveId, {
    status: "new",
    knownBeforeApp: false,
    masteryScore: 0,
    confidenceScore: 0,
  });
  const work = createCollection(db, userId, "Work");
  const forgetting = createCollection(db, userId, "Words I Keep Forgetting");

  addWordToCollection(db, userId, work.id, userVocabularyId);
  addWordToCollection(db, userId, forgetting.id, userVocabularyId);

  const rows = db.select().from(collectionWords).where(eq(collectionWords.userVocabularyId, userVocabularyId)).all();
  assert.equal(rows.length, 2);
});

test("adding the same word to a collection twice does not duplicate", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, achieveId, {
    status: "new",
    knownBeforeApp: false,
    masteryScore: 0,
    confidenceScore: 0,
  });
  const { id: collectionId } = createCollection(db, userId, "Work");

  addWordToCollection(db, userId, collectionId, userVocabularyId);
  addWordToCollection(db, userId, collectionId, userVocabularyId);

  const rows = db.select().from(collectionWords).where(eq(collectionWords.collectionId, collectionId)).all();
  assert.equal(rows.length, 1);
});

test("removing a word from a collection works", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, achieveId, {
    status: "new",
    knownBeforeApp: false,
    masteryScore: 0,
    confidenceScore: 0,
  });
  const { id: collectionId } = createCollection(db, userId, "Work");
  addWordToCollection(db, userId, collectionId, userVocabularyId);

  removeWordFromCollection(db, userId, collectionId, userVocabularyId);

  const collections = listCollections(db, userId);
  assert.equal(collections[0].wordCount, 0);
});

test("deleting a collection does not delete the vocabulary word", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, achieveId, {
    status: "learning",
    knownBeforeApp: false,
    masteryScore: 40,
    confidenceScore: 30,
  });
  const { id: collectionId } = createCollection(db, userId, "Work");
  addWordToCollection(db, userId, collectionId, userVocabularyId);

  deleteCollection(db, userId, collectionId);

  assert.equal(listCollections(db, userId).length, 0);
  const uv = db.select().from(userVocabulary).where(eq(userVocabulary.id, userVocabularyId)).get();
  assert.ok(uv, "the user_vocabulary row must still exist");
  assert.equal(uv?.status, "learning");
  const wordRow = db.select().from(words).where(eq(words.id, achieveId)).get();
  assert.ok(wordRow, "the dictionary word must still exist");

  const membership = db.select().from(collectionWords).where(eq(collectionWords.collectionId, collectionId)).all();
  assert.equal(membership.length, 0);
});

test("a collection can be renamed", () => {
  const { db, userId } = setup();
  const { id } = createCollection(db, userId, "Work");
  updateCollection(db, userId, id, { name: "Business English" });

  const collections = listCollections(db, userId);
  assert.equal(collections[0].name, "Business English");
});

test("acting on another user's collection is rejected", () => {
  const { db, userId } = setup();
  const otherUserId = newId("user");
  db.insert(users).values({ id: otherUserId, name: "Other User" }).run();
  const { id: collectionId } = createCollection(db, userId, "Work");

  assert.throws(() => deleteCollection(db, otherUserId, collectionId));
  assert.equal(listCollections(db, userId).length, 1, "the original owner's collection must be unaffected");
});
