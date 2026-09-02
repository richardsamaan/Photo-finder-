import { test } from "node:test";
import assert from "node:assert/strict";
import { eq, and } from "drizzle-orm";
import { createTestDb } from "../../db/testUtils.js";
import { seedEnglishLanguage, seedWords, seedRelations } from "../../db/seed.js";
import { users, words, userVocabulary } from "../../db/schema.js";
import { newId } from "../../lib/ids.js";
import { addWord, getSummary, getWordDetail, listVocabulary, markDontKnow, upsertUserVocabulary } from "./service.js";

type TestDb = ReturnType<typeof createTestDb>["db"];

function setup() {
  const { db } = createTestDb();
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();
  const languageId = seedEnglishLanguage(db);
  const idByNormalized = seedWords(db, languageId);
  seedRelations(db, idByNormalized);
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

test("listVocabulary returns only the current user's vocabulary", () => {
  const { db, userId, languageId } = setup();
  const otherUserId = newId("user");
  db.insert(users).values({ id: otherUserId, name: "Other User" }).run();

  const achieveId = wordIdFor(db, languageId, "achieve");
  const happyId = wordIdFor(db, languageId, "happy");
  const bankId = wordIdFor(db, languageId, "bank");

  upsertUserVocabulary(db, userId, achieveId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });
  upsertUserVocabulary(db, userId, happyId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });
  upsertUserVocabulary(db, otherUserId, bankId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });

  const result = listVocabulary(db, userId, {});
  assert.equal(result.total, 2);
  assert.ok(result.items.every((i) => [achieveId, happyId].includes(i.wordId)));
});

test("search matches the word itself, case-insensitively", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  upsertUserVocabulary(db, userId, achieveId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });

  const result = listVocabulary(db, userId, { search: "ACHIEVE" });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].word, "achieve");
});

test("search matches definition text", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  upsertUserVocabulary(db, userId, achieveId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });

  const result = listVocabulary(db, userId, { search: "desired result through effort" });
  assert.equal(result.total, 1);
});

test("filtering by status works", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  const happyId = wordIdFor(db, languageId, "happy");
  upsertUserVocabulary(db, userId, achieveId, { status: "mastered", knownBeforeApp: false, masteryScore: 95, confidenceScore: 90 });
  upsertUserVocabulary(db, userId, happyId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });

  const result = listVocabulary(db, userId, { status: "mastered" });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].wordId, achieveId);
});

test("needs-review filtering works", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  const happyId = wordIdFor(db, languageId, "happy");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, achieveId, {
    status: "learning",
    knownBeforeApp: false,
    masteryScore: 40,
    confidenceScore: 30,
  });
  upsertUserVocabulary(db, userId, happyId, { status: "learning", knownBeforeApp: false, masteryScore: 40, confidenceScore: 30 });
  db.update(userVocabulary).set({ needsReview: true }).where(eq(userVocabulary.id, userVocabularyId)).run();

  const result = listVocabulary(db, userId, { needsReview: true });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].wordId, achieveId);
});

test("known-before-app filtering works", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  const happyId = wordIdFor(db, languageId, "happy");
  upsertUserVocabulary(db, userId, achieveId, { status: "familiar", knownBeforeApp: true, masteryScore: 60, confidenceScore: 70 });
  upsertUserVocabulary(db, userId, happyId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });

  const result = listVocabulary(db, userId, { known: "known_before_app" });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].wordId, achieveId);
  assert.equal(result.items[0].knownBeforeApp, true);
});

test("learned-through-app filtering works", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  const happyId = wordIdFor(db, languageId, "happy");
  upsertUserVocabulary(db, userId, achieveId, { status: "familiar", knownBeforeApp: true, masteryScore: 60, confidenceScore: 70 });
  upsertUserVocabulary(db, userId, happyId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });

  const result = listVocabulary(db, userId, { known: "learned_through_app" });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].wordId, happyId);
  assert.equal(result.items[0].knownBeforeApp, false);
});

test("sorting by mastery orders highest first", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  const happyId = wordIdFor(db, languageId, "happy");
  upsertUserVocabulary(db, userId, achieveId, { status: "learning", knownBeforeApp: false, masteryScore: 30, confidenceScore: 20 });
  upsertUserVocabulary(db, userId, happyId, { status: "learning", knownBeforeApp: false, masteryScore: 80, confidenceScore: 70 });

  const result = listVocabulary(db, userId, { sort: "mastery" });
  assert.equal(result.items[0].wordId, happyId);
  assert.equal(result.items[1].wordId, achieveId);
});

test("sorting alphabetically works", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  const happyId = wordIdFor(db, languageId, "happy");
  upsertUserVocabulary(db, userId, happyId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });
  upsertUserVocabulary(db, userId, achieveId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });

  const result = listVocabulary(db, userId, { sort: "alphabetical" });
  assert.equal(result.items[0].word, "achieve");
  assert.equal(result.items[1].word, "happy");
});

test("word details return senses, synonyms, and antonyms", () => {
  const { db, userId, languageId } = setup();
  const happyId = wordIdFor(db, languageId, "happy");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, happyId, {
    status: "familiar",
    knownBeforeApp: true,
    masteryScore: 60,
    confidenceScore: 70,
  });

  const detail = getWordDetail(db, userId, userVocabularyId);
  assert.ok(detail);
  assert.equal(detail!.word, "happy");
  assert.equal(detail!.senses.length, 1);
  assert.equal(detail!.senses[0].partOfSpeech, "adjective");
  assert.ok(detail!.synonyms.includes("joyful"));
  assert.ok(detail!.synonyms.includes("glad"));
  assert.ok(detail!.antonyms.includes("sad"));
});

test("word details for a word with multiple senses include all of them", () => {
  const { db, userId, languageId } = setup();
  const bankId = wordIdFor(db, languageId, "bank");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, bankId, {
    status: "new",
    knownBeforeApp: false,
    masteryScore: 0,
    confidenceScore: 0,
  });

  const detail = getWordDetail(db, userId, userVocabularyId);
  assert.equal(detail!.senses.length, 2);
});

test("adding a new word creates a dictionary entry and a new user_vocabulary row", () => {
  const { db, userId, languageId } = setup();
  const result = addWord(db, userId, languageId, "resilient");
  assert.equal(result.wordCreated, true);

  const detail = getWordDetail(db, userId, result.userVocabularyId);
  assert.equal(detail?.word, "resilient");
  assert.equal(detail?.status, "new");
  assert.equal(detail?.knownBeforeApp, false);
  assert.equal(detail?.senses.length, 0); // no invented definition
});

test("adding an existing word reuses the dictionary entry and does not duplicate", () => {
  const { db, userId, languageId } = setup();
  const first = addWord(db, userId, languageId, "achieve");
  assert.equal(first.wordCreated, false); // already seeded

  const second = addWord(db, userId, languageId, "Achieve"); // different casing
  assert.equal(second.wordCreated, false);
  assert.equal(second.wordId, first.wordId);
  assert.equal(second.userVocabularyId, first.userVocabularyId);

  const rows = db.select().from(userVocabulary).where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.wordId, first.wordId))).all();
  assert.equal(rows.length, 1);
});

test('"I don\'t know this word" creates a new user_vocabulary record', () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");

  const result = markDontKnow(db, userId, achieveId);
  const detail = getWordDetail(db, userId, result.userVocabularyId);
  assert.equal(detail?.status, "new");
  assert.equal(detail?.knownBeforeApp, false);
});

test('"I don\'t know this word" resets a word previously known before the app', () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  upsertUserVocabulary(db, userId, achieveId, { status: "familiar", knownBeforeApp: true, masteryScore: 60, confidenceScore: 70 });

  const result = markDontKnow(db, userId, achieveId);
  const detail = getWordDetail(db, userId, result.userVocabularyId);
  assert.equal(detail?.status, "new");
  assert.equal(detail?.knownBeforeApp, false);

  const rows = db.select().from(userVocabulary).where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.wordId, achieveId))).all();
  assert.equal(rows.length, 1, "should update the existing row, not create a duplicate");
});

test("an empty vocabulary bank returns an empty list and a zeroed summary", () => {
  const { db, userId } = setup();
  const result = listVocabulary(db, userId, {});
  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);

  const summary = getSummary(db, userId);
  assert.deepEqual(summary, {
    total: 0,
    new: 0,
    learning: 0,
    familiar: 0,
    mastered: 0,
    needsReview: 0,
    knownBeforeApp: 0,
    learnedThroughApp: 0,
  });
});

test("getSummary reflects real counts from the database, not hard-coded values", () => {
  const { db, userId, languageId } = setup();
  const achieveId = wordIdFor(db, languageId, "achieve");
  const happyId = wordIdFor(db, languageId, "happy");
  const bankId = wordIdFor(db, languageId, "bank");
  upsertUserVocabulary(db, userId, achieveId, { status: "mastered", knownBeforeApp: true, masteryScore: 95, confidenceScore: 90 });
  upsertUserVocabulary(db, userId, happyId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });
  const { userVocabularyId } = upsertUserVocabulary(db, userId, bankId, {
    status: "learning",
    knownBeforeApp: false,
    masteryScore: 40,
    confidenceScore: 30,
  });
  db.update(userVocabulary).set({ needsReview: true }).where(eq(userVocabulary.id, userVocabularyId)).run();

  const summary = getSummary(db, userId);
  assert.equal(summary.total, 3);
  assert.equal(summary.mastered, 1);
  assert.equal(summary.new, 1);
  assert.equal(summary.learning, 1);
  assert.equal(summary.needsReview, 1);
  assert.equal(summary.knownBeforeApp, 1);
  assert.equal(summary.learnedThroughApp, 2);
});
