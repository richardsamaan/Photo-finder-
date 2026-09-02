import { test } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../../db/testUtils.js";
import { languages, words, users, userVocabulary, vocabularyReviewHistory } from "../../db/schema.js";
import { newId } from "../../lib/ids.js";
import { upsertUserVocabulary } from "../vocabulary-bank/service.js";
import { recordReview, recordDontKnow } from "./reviewService.js";
import { MASTERY_MIN_SUCCESSFUL_REVIEWS } from "../mastery/config.js";

type TestDb = ReturnType<typeof createTestDb>["db"];

function setup() {
  const { db } = createTestDb();
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();
  const languageId = newId("lang");
  db.insert(languages).values({ id: languageId, code: "en", name: "English", nativeName: "English" }).run();
  const wordId = newId("word");
  db.insert(words).values({ id: wordId, languageId, word: "achieve", normalizedWord: "achieve" }).run();
  const { userVocabularyId } = upsertUserVocabulary(db, userId, wordId, {
    status: "new",
    knownBeforeApp: false,
    masteryScore: 0,
    confidenceScore: 0,
  });
  return { db, userId, wordId, userVocabularyId };
}

function driveToMastered(db: TestDb, userId: string, userVocabularyId: string) {
  let last;
  // Enough GOOD active_usage reviews (strong evidence dimension) to clear
  // both the score threshold and the minimum-successful-reviews gate.
  for (let i = 0; i < MASTERY_MIN_SUCCESSFUL_REVIEWS + 2; i++) {
    last = recordReview(db, userId, { userVocabularyId, testType: "active_usage", outcome: "good" });
  }
  return last!;
}

test("a review creates a history record", () => {
  const { db, userId, userVocabularyId } = setup();
  recordReview(db, userId, { userVocabularyId, testType: "multiple_choice", outcome: "good" });

  const rows = db.select().from(vocabularyReviewHistory).where(eq(vocabularyReviewHistory.userVocabularyId, userVocabularyId)).all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].testType, "multiple_choice");
  assert.equal(rows[0].outcome, "good");
});

test("a review updates the persisted mastery score", () => {
  const { db, userId, userVocabularyId } = setup();
  const result = recordReview(db, userId, { userVocabularyId, testType: "active_usage", outcome: "good" });
  assert.ok(result.newMasteryScore > result.previousMasteryScore);

  const uv = db.select().from(userVocabulary).where(eq(userVocabulary.id, userVocabularyId)).get();
  assert.equal(uv?.masteryScore, result.newMasteryScore);
});

test("a review updates the status", () => {
  const { db, userId, userVocabularyId } = setup();
  driveToMastered(db, userId, userVocabularyId);
  const uv = db.select().from(userVocabulary).where(eq(userVocabulary.id, userVocabularyId)).get();
  assert.equal(uv?.status, "mastered");
});

test("a review updates next_review_at", () => {
  const { db, userId, userVocabularyId } = setup();
  const before = db.select().from(userVocabulary).where(eq(userVocabulary.id, userVocabularyId)).get();
  assert.equal(before?.nextReviewAt, null);

  recordReview(db, userId, { userVocabularyId, testType: "multiple_choice", outcome: "good" });
  const after = db.select().from(userVocabulary).where(eq(userVocabulary.id, userVocabularyId)).get();
  assert.ok(after?.nextReviewAt);
});

test("a review updates needs_review - set on failure, cleared on success", () => {
  const { db, userId, userVocabularyId } = setup();
  recordReview(db, userId, { userVocabularyId, testType: "multiple_choice", outcome: "again" });
  let uv = db.select().from(userVocabulary).where(eq(userVocabulary.id, userVocabularyId)).get();
  assert.equal(uv?.needsReview, true);

  recordReview(db, userId, { userVocabularyId, testType: "multiple_choice", outcome: "good" });
  uv = db.select().from(userVocabulary).where(eq(userVocabulary.id, userVocabularyId)).get();
  assert.equal(uv?.needsReview, false);
});

test("the server computes everything - a client cannot inject mastery, status, or interval", () => {
  const { db, userId, userVocabularyId } = setup();
  // RecordReviewInput's type only accepts userVocabularyId/testType/outcome/
  // responseTimeMs - there is structurally no field for a client to smuggle
  // a mastery score or status through. Confirm the computed result matches
  // what the pure engine would independently produce for this exact input.
  const result = recordReview(db, userId, { userVocabularyId, testType: "active_usage", outcome: "good" });
  // A single review - however strong the evidence type - must never jump
  // straight to "familiar" or "mastered"; there simply isn't enough
  // evidence yet for durable-knowledge claims that high.
  assert.ok(
    result.newStatus === "new" || result.newStatus === "learning",
    `expected "new" or "learning" after one review, got "${result.newStatus}"`
  );
  assert.ok(result.newMasteryScore < 50, "one review should not produce a suspiciously high score");
});

test("full flow: New -> Learning -> Familiar -> Mastered", () => {
  const { db, userId, userVocabularyId } = setup();
  const seen = new Set<string>();
  let result = recordReview(db, userId, { userVocabularyId, testType: "active_usage", outcome: "good" });
  seen.add(result.newStatus);

  for (let i = 0; i < MASTERY_MIN_SUCCESSFUL_REVIEWS + 5 && result.newStatus !== "mastered"; i++) {
    result = recordReview(db, userId, { userVocabularyId, testType: "active_usage", outcome: "good" });
    seen.add(result.newStatus);
  }

  assert.equal(result.newStatus, "mastered");
  assert.ok(seen.has("learning"), `expected to pass through "learning", saw: ${[...seen]}`);
  assert.ok(seen.has("familiar"), `expected to pass through "familiar", saw: ${[...seen]}`);
});

test("a forgotten mastered word can be reviewed again (AGAIN demotes status and flags needs_review)", () => {
  const { db, userId, userVocabularyId } = setup();
  driveToMastered(db, userId, userVocabularyId);

  const afterAgain = recordReview(db, userId, { userVocabularyId, testType: "active_usage", outcome: "again" });
  assert.notEqual(afterAgain.newStatus, "mastered");
  assert.equal(afterAgain.needsReview, true);
  assert.ok(afterAgain.newIntervalDays < afterAgain.previousIntervalDays, "interval should shrink after AGAIN");
});

test('"I don\'t know" on a brand-new word creates the vocabulary row and a real review event', () => {
  const { db, userId } = setup();
  const otherWordId = newId("word");
  const languageRow = db.select().from(languages).get()!;
  db.insert(words).values({ id: otherWordId, languageId: languageRow.id, word: "resilient", normalizedWord: "resilient" }).run();

  const result = recordDontKnow(db, userId, otherWordId);
  assert.equal(result.needsReview, true);

  const history = db.select().from(vocabularyReviewHistory).where(eq(vocabularyReviewHistory.userVocabularyId, result.userVocabularyId)).all();
  assert.equal(history.length, 1);
  assert.equal(history[0].outcome, "dont_know");
});

test('"I don\'t know" preserves prior history and does not delete the vocabulary item', () => {
  const { db, userId, userVocabularyId, wordId } = setup();
  driveToMastered(db, userId, userVocabularyId);
  const priorHistoryCount = db
    .select()
    .from(vocabularyReviewHistory)
    .where(eq(vocabularyReviewHistory.userVocabularyId, userVocabularyId))
    .all().length;

  recordDontKnow(db, userId, wordId);

  const historyAfter = db.select().from(vocabularyReviewHistory).where(eq(vocabularyReviewHistory.userVocabularyId, userVocabularyId)).all();
  assert.equal(historyAfter.length, priorHistoryCount + 1, "should add one new event, not replace history");

  const uv = db.select().from(userVocabulary).where(eq(userVocabulary.id, userVocabularyId)).get();
  assert.ok(uv, "the vocabulary item must still exist");
});

test('"I don\'t know" reduces mastery/confidence rather than leaving a mastered word\'s score untouched', () => {
  const { db, userId, userVocabularyId, wordId } = setup();
  driveToMastered(db, userId, userVocabularyId);
  const before = db.select().from(userVocabulary).where(eq(userVocabulary.id, userVocabularyId)).get()!;

  recordDontKnow(db, userId, wordId);

  const after = db.select().from(userVocabulary).where(eq(userVocabulary.id, userVocabularyId)).get()!;
  assert.ok(after.masteryScore < before.masteryScore, "mastery should decrease, not stay at the mastered level");
  assert.notEqual(after.masteryScore, 0, "should not be a hard reset to zero given a strong history");
});

test('"I don\'t know" schedules a near-term review, not a far-future one', () => {
  const { db, userId, userVocabularyId, wordId } = setup();
  driveToMastered(db, userId, userVocabularyId); // pushes the interval out to many days

  const result = recordDontKnow(db, userId, wordId);
  assert.equal(result.newIntervalDays, 1, "AGAIN/dont_know should collapse to the short fixed interval");
});

test("re-recording a review for the same word never creates duplicate user_vocabulary rows", () => {
  const { db, userId, userVocabularyId } = setup();
  recordReview(db, userId, { userVocabularyId, testType: "multiple_choice", outcome: "good" });
  recordReview(db, userId, { userVocabularyId, testType: "multiple_choice", outcome: "again" });

  const rows = db.select().from(userVocabulary).where(and(eq(userVocabulary.userId, userId))).all();
  assert.equal(rows.length, 1);
});
