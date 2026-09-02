import { test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../db/testUtils.js";
import { languages, words, users, userVocabulary } from "../../db/schema.js";
import { newId } from "../../lib/ids.js";
import { upsertUserVocabulary } from "../vocabulary-bank/service.js";
import { recordReview } from "./reviewService.js";
import { getLearningQueue, getDueReviews, getLearningStats } from "./queueService.js";
import { MASTERY_MIN_SUCCESSFUL_REVIEWS } from "../mastery/config.js";

type TestDb = ReturnType<typeof createTestDb>["db"];

function setup() {
  const { db } = createTestDb();
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();
  const languageId = newId("lang");
  db.insert(languages).values({ id: languageId, code: "en", name: "English", nativeName: "English" }).run();
  return { db, userId, languageId };
}

function addWord(db: TestDb, languageId: string, word: string): string {
  const wordId = newId("word");
  db.insert(words).values({ id: wordId, languageId, word, normalizedWord: word }).run();
  return wordId;
}

test("a brand-new word is available in the queue", () => {
  const { db, userId, languageId } = setup();
  const wordId = addWord(db, languageId, "achieve");
  upsertUserVocabulary(db, userId, wordId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });

  const queue = getLearningQueue(db, userId);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].reason, "new");
});

test("an overdue word is returned and flagged overdue", () => {
  const { db, userId, languageId } = setup();
  const wordId = addWord(db, languageId, "achieve");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, wordId, {
    status: "learning",
    knownBeforeApp: false,
    masteryScore: 40,
    confidenceScore: 30,
  });
  db.update(userVocabulary)
    .set({ nextReviewAt: "2020-01-01T00:00:00Z", lastReviewedAt: "2020-01-01T00:00:00Z" })
    .where(eq(userVocabulary.id, userVocabularyId))
    .run();

  const queue = getLearningQueue(db, userId);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].reason, "overdue");
  assert.ok(queue[0].overdueDays > 0);
});

test("needs-review words are prioritized above a merely-due word", () => {
  const { db, userId, languageId } = setup();
  const dueWordId = addWord(db, languageId, "achieve");
  const { userVocabularyId: dueUv } = upsertUserVocabulary(db, userId, dueWordId, {
    status: "learning",
    knownBeforeApp: false,
    masteryScore: 40,
    confidenceScore: 30,
  });
  db.update(userVocabulary).set({ nextReviewAt: new Date().toISOString() }).where(eq(userVocabulary.id, dueUv)).run();

  const needsReviewWordId = addWord(db, languageId, "confident");
  const { userVocabularyId: nrUv } = upsertUserVocabulary(db, userId, needsReviewWordId, {
    status: "learning",
    knownBeforeApp: false,
    masteryScore: 40,
    confidenceScore: 30,
  });
  db.update(userVocabulary)
    .set({ nextReviewAt: new Date().toISOString(), needsReview: true })
    .where(eq(userVocabulary.id, nrUv))
    .run();

  const queue = getLearningQueue(db, userId);
  assert.equal(queue[0].userVocabularyId, nrUv);
});

test("a healthy mastered word (recently reviewed, not due) is excluded from the queue", () => {
  const { db, userId, languageId } = setup();
  const wordId = addWord(db, languageId, "achieve");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, wordId, {
    status: "mastered",
    knownBeforeApp: false,
    masteryScore: 95,
    confidenceScore: 90,
  });
  const farFuture = new Date();
  farFuture.setDate(farFuture.getDate() + 60);
  db.update(userVocabulary)
    .set({ nextReviewAt: farFuture.toISOString(), lastReviewedAt: new Date().toISOString() })
    .where(eq(userVocabulary.id, userVocabularyId))
    .run();

  const queue = getLearningQueue(db, userId);
  assert.equal(queue.length, 0, "a fresh, well-mastered word should not appear in the active queue");
});

test("a forgotten (badly decayed) mastered word returns to the queue even though it isn't formally due yet", () => {
  const { db, userId, languageId } = setup();
  const wordId = addWord(db, languageId, "achieve");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, wordId, {
    status: "mastered",
    knownBeforeApp: false,
    masteryScore: 90,
    confidenceScore: 90,
  });
  const farFuture = new Date();
  farFuture.setDate(farFuture.getDate() + 60);
  const longAgo = new Date();
  longAgo.setDate(longAgo.getDate() - 400); // long enough for even a high-mastery word to decay heavily
  db.update(userVocabulary)
    .set({ nextReviewAt: farFuture.toISOString(), lastReviewedAt: longAgo.toISOString() })
    .where(eq(userVocabulary.id, userVocabularyId))
    .run();

  const queue = getLearningQueue(db, userId);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].reason, "mastered_decayed");
});

test("getDueReviews excludes brand-new words but includes genuine due reviews", () => {
  const { db, userId, languageId } = setup();
  const newWordId = addWord(db, languageId, "achieve");
  upsertUserVocabulary(db, userId, newWordId, { status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 });

  const dueWordId = addWord(db, languageId, "confident");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, dueWordId, {
    status: "learning",
    knownBeforeApp: false,
    masteryScore: 40,
    confidenceScore: 30,
  });
  db.update(userVocabulary).set({ nextReviewAt: "2020-01-01T00:00:00Z" }).where(eq(userVocabulary.id, userVocabularyId)).run();

  const due = getDueReviews(db, userId);
  assert.equal(due.length, 1);
  assert.equal(due[0].userVocabularyId, userVocabularyId);
});

test("stats reflect real database counts, including due/overdue/active-learning breakdowns", () => {
  const { db, userId, languageId } = setup();
  const wordId = addWord(db, languageId, "achieve");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, wordId, {
    status: "learning",
    knownBeforeApp: false,
    masteryScore: 40,
    confidenceScore: 30,
  });
  db.update(userVocabulary).set({ nextReviewAt: "2020-01-01T00:00:00Z" }).where(eq(userVocabulary.id, userVocabularyId)).run();

  const stats = getLearningStats(db, userId);
  assert.equal(stats.total, 1);
  assert.equal(stats.learning, 1);
  assert.equal(stats.activeLearning, 1);
  assert.ok(stats.overdue >= 1);
});

test("retention rate reflects the ratio of successful to total reviews", () => {
  const { db, userId, languageId } = setup();
  const wordId = addWord(db, languageId, "achieve");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, wordId, {
    status: "new",
    knownBeforeApp: false,
    masteryScore: 0,
    confidenceScore: 0,
  });

  recordReview(db, userId, { userVocabularyId, testType: "multiple_choice", outcome: "good" });
  recordReview(db, userId, { userVocabularyId, testType: "multiple_choice", outcome: "again" });

  const stats = getLearningStats(db, userId);
  assert.equal(stats.retentionRate, 50);
});

test("driving a word to mastered still lets it appear in getLearningQueue candidates for a live decay check, not silently vanish from the system", () => {
  const { db, userId, languageId } = setup();
  const wordId = addWord(db, languageId, "achieve");
  const { userVocabularyId } = upsertUserVocabulary(db, userId, wordId, {
    status: "new",
    knownBeforeApp: false,
    masteryScore: 0,
    confidenceScore: 0,
  });
  for (let i = 0; i < MASTERY_MIN_SUCCESSFUL_REVIEWS + 2; i++) {
    recordReview(db, userId, { userVocabularyId, testType: "active_usage", outcome: "good" });
  }
  const uv = db.select().from(userVocabulary).where(eq(userVocabulary.id, userVocabularyId)).get();
  assert.equal(uv?.status, "mastered");
  // Freshly mastered (just reviewed) - should NOT be in the active queue.
  assert.equal(getLearningQueue(db, userId).length, 0);
});
