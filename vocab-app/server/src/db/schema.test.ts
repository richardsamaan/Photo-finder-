import { test } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "./testUtils.js";
import {
  languages,
  words,
  wordSenses,
  users,
  userVocabulary,
  vocabularyReviewHistory,
  vocabularyCollections,
  collectionWords,
} from "./schema.js";
import { newId } from "../lib/ids.js";

function seedLanguageAndWord(db: ReturnType<typeof createTestDb>["db"]) {
  const languageId = newId("lang");
  db.insert(languages).values({ id: languageId, code: "en", name: "English", nativeName: "English" }).run();
  const wordId = newId("word");
  db.insert(words).values({ id: wordId, languageId, word: "achieve", normalizedWord: "achieve" }).run();
  return { languageId, wordId };
}

test("an English language row can be created", () => {
  const { db } = createTestDb();
  db.insert(languages).values({ id: newId("lang"), code: "en", name: "English", nativeName: "English" }).run();

  const row = db.select().from(languages).where(eq(languages.code, "en")).get();
  assert.equal(row?.name, "English");
});

test("a word belongs to a language", () => {
  const { db } = createTestDb();
  const { languageId, wordId } = seedLanguageAndWord(db);

  const row = db.select().from(words).where(eq(words.id, wordId)).get();
  assert.equal(row?.languageId, languageId);
});

test("a word can have multiple senses", () => {
  const { db } = createTestDb();
  const { wordId } = seedLanguageAndWord(db);

  db.insert(wordSenses)
    .values([
      { id: newId("sense"), wordId, definition: "A financial institution.", partOfSpeech: "noun", senseOrder: 0 },
      { id: newId("sense"), wordId, definition: "The land alongside a river.", partOfSpeech: "noun", senseOrder: 1 },
    ])
    .run();

  const senses = db.select().from(wordSenses).where(eq(wordSenses.wordId, wordId)).all();
  assert.equal(senses.length, 2);
});

test("a user can add a word to their personal vocabulary", () => {
  const { db } = createTestDb();
  const { wordId } = seedLanguageAndWord(db);
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();

  db.insert(userVocabulary).values({ id: newId("uv"), userId, wordId }).run();

  const row = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.wordId, wordId)))
    .get();
  assert.equal(row?.status, "new");
});

test("the same user cannot add the same word twice", () => {
  const { db } = createTestDb();
  const { wordId } = seedLanguageAndWord(db);
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();
  db.insert(userVocabulary).values({ id: newId("uv"), userId, wordId }).run();

  assert.throws(() => {
    db.insert(userVocabulary).values({ id: newId("uv"), userId, wordId }).run();
  });
});

test("review history keeps every review, not just the latest", () => {
  const { db } = createTestDb();
  const { wordId } = seedLanguageAndWord(db);
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();
  const uvId = newId("uv");
  db.insert(userVocabulary).values({ id: uvId, userId, wordId }).run();

  db.insert(vocabularyReviewHistory)
    .values([
      {
        id: newId("review"),
        userVocabularyId: uvId,
        testType: "multiple_choice",
        result: "correct",
        previousScore: 0,
        newScore: 20,
      },
      {
        id: newId("review"),
        userVocabularyId: uvId,
        testType: "english_to_meaning",
        result: "incorrect",
        previousScore: 20,
        newScore: 10,
      },
    ])
    .run();

  const reviews = db
    .select()
    .from(vocabularyReviewHistory)
    .where(eq(vocabularyReviewHistory.userVocabularyId, uvId))
    .all();
  assert.equal(reviews.length, 2);
});

test("a mastered word is never deleted, only archived", () => {
  const { db } = createTestDb();
  const { wordId } = seedLanguageAndWord(db);
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();
  const uvId = newId("uv");
  db.insert(userVocabulary).values({ id: uvId, userId, wordId, status: "mastered", masteryScore: 95 }).run();

  db.update(userVocabulary).set({ archived: true }).where(eq(userVocabulary.id, uvId)).run();

  const row = db.select().from(userVocabulary).where(eq(userVocabulary.id, uvId)).get();
  assert.equal(row?.status, "mastered");
  assert.equal(row?.archived, true);
});

test("a collection can contain multiple words", () => {
  const { db } = createTestDb();
  const { languageId, wordId: word1 } = seedLanguageAndWord(db);
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();

  const word2 = newId("word");
  db.insert(words).values({ id: word2, languageId, word: "confident", normalizedWord: "confident" }).run();

  const uv1 = newId("uv");
  const uv2 = newId("uv");
  db.insert(userVocabulary)
    .values([
      { id: uv1, userId, wordId: word1 },
      { id: uv2, userId, wordId: word2 },
    ])
    .run();

  const collectionId = newId("coll");
  db.insert(vocabularyCollections).values({ id: collectionId, userId, name: "Work" }).run();
  db.insert(collectionWords)
    .values([
      { collectionId, userVocabularyId: uv1 },
      { collectionId, userVocabularyId: uv2 },
    ])
    .run();

  const rows = db.select().from(collectionWords).where(eq(collectionWords.collectionId, collectionId)).all();
  assert.equal(rows.length, 2);
});

test("a word can belong to multiple collections", () => {
  const { db } = createTestDb();
  const { wordId } = seedLanguageAndWord(db);
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();
  const uvId = newId("uv");
  db.insert(userVocabulary).values({ id: uvId, userId, wordId }).run();

  const coll1 = newId("coll");
  const coll2 = newId("coll");
  db.insert(vocabularyCollections)
    .values([
      { id: coll1, userId, name: "Work" },
      { id: coll2, userId, name: "Words I Keep Forgetting" },
    ])
    .run();
  db.insert(collectionWords)
    .values([
      { collectionId: coll1, userVocabularyId: uvId },
      { collectionId: coll2, userVocabularyId: uvId },
    ])
    .run();

  const rows = db.select().from(collectionWords).where(eq(collectionWords.userVocabularyId, uvId)).all();
  assert.equal(rows.length, 2);
});

test("foreign-key relationships are enforced", () => {
  const { db } = createTestDb();
  assert.throws(() => {
    db.insert(wordSenses)
      .values({ id: newId("sense"), wordId: "word_does_not_exist", definition: "x", partOfSpeech: "noun" })
      .run();
  });
});

test("two users can have completely independent vocabulary state for the same word", () => {
  const { db } = createTestDb();
  const { wordId } = seedLanguageAndWord(db);
  const user1 = newId("user");
  const user2 = newId("user");
  db.insert(users)
    .values([
      { id: user1, name: "User One" },
      { id: user2, name: "User Two" },
    ])
    .run();

  db.insert(userVocabulary)
    .values([
      { id: newId("uv"), userId: user1, wordId, status: "mastered", masteryScore: 95 },
      { id: newId("uv"), userId: user2, wordId, status: "new", masteryScore: 5 },
    ])
    .run();

  const row1 = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, user1), eq(userVocabulary.wordId, wordId)))
    .get();
  const row2 = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, user2), eq(userVocabulary.wordId, wordId)))
    .get();

  assert.equal(row1?.masteryScore, 95);
  assert.equal(row2?.masteryScore, 5);
  assert.notEqual(row1?.status, row2?.status);
});
