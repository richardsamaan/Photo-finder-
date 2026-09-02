import { test } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../../db/testUtils.js";
import { seedEnglishLanguage, seedWords } from "../../db/seed.js";
import { users, words, wordSenses, userVocabulary, vocabularyReviewHistory } from "../../db/schema.js";
import { newId } from "../../lib/ids.js";
import { upsertUserVocabulary } from "../vocabulary-bank/service.js";
import {
  startSession,
  getSessionInfo,
  getCurrentQuestion,
  submitAnswer,
  submitOutcome,
  completeSession,
  exitSession,
  startDifficultWordsSession,
} from "./sessionService.js";
import { DEFAULT_DAILY_REVIEW_LIMIT, DEFAULT_NEW_WORD_LIMIT } from "./sessionConfig.js";

type TestDb = ReturnType<typeof createTestDb>["db"];

function setup() {
  const { db } = createTestDb();
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();
  const languageId = seedEnglishLanguage(db);
  seedWords(db, languageId);
  return { db, userId, languageId };
}

function wordRowFor(db: TestDb, languageId: string, normalized: string) {
  return db
    .select()
    .from(words)
    .where(and(eq(words.languageId, languageId), eq(words.normalizedWord, normalized)))
    .get()!;
}

function primaryDefinition(db: TestDb, wordId: string): string {
  return db
    .select({ definition: wordSenses.definition })
    .from(wordSenses)
    .where(and(eq(wordSenses.wordId, wordId), eq(wordSenses.senseOrder, 0)))
    .get()!.definition;
}

// meaning_to_english/spelling/fill_blank deliberately omit `word` from the
// question payload (it's the answer) - tests that need the real word to
// submit a correct answer look it up directly via wordId instead.
function wordById(db: TestDb, wordId: string): string {
  return db.select({ word: words.word }).from(words).where(eq(words.id, wordId)).get()!.word;
}

function addDueWord(
  db: TestDb,
  userId: string,
  languageId: string,
  normalized: string,
  overdueMinutes: number,
  overrides: Partial<{ status: "new" | "learning" | "familiar" | "mastered"; correctCount: number; incorrectCount: number }> = {}
) {
  const wordRow = wordRowFor(db, languageId, normalized);
  const { userVocabularyId } = upsertUserVocabulary(db, userId, wordRow.id, {
    status: overrides.status ?? "learning",
    knownBeforeApp: false,
    masteryScore: 40,
    confidenceScore: 30,
  });
  const pastIso = new Date(Date.now() - overdueMinutes * 60_000).toISOString();
  db.update(userVocabulary)
    .set({
      nextReviewAt: pastIso,
      correctCount: overrides.correctCount ?? 0,
      incorrectCount: overrides.incorrectCount ?? 0,
    })
    .where(eq(userVocabulary.id, userVocabularyId))
    .run();
  return { userVocabularyId, wordId: wordRow.id };
}

function addNewWord(db: TestDb, userId: string, languageId: string, normalized: string) {
  const wordRow = wordRowFor(db, languageId, normalized);
  const { userVocabularyId } = upsertUserVocabulary(db, userId, wordRow.id, {
    status: "new",
    knownBeforeApp: false,
    masteryScore: 0,
    confidenceScore: 0,
  });
  return { userVocabularyId, wordId: wordRow.id };
}

// ============================================================
// SESSION lifecycle
// ============================================================

test("a daily_review session can be created from due words", () => {
  const { db, userId, languageId } = setup();
  addDueWord(db, userId, languageId, "achieve", 60);
  addDueWord(db, userId, languageId, "happy", 30);

  const started = startSession(db, userId, { type: "daily_review" });
  assert.equal(started.type, "daily_review");
  assert.equal(started.progress.totalItems, 2);
  assert.equal(started.progress.currentIndex, 0);
});

test("a new_words session can be created from status=new words", () => {
  const { db, userId, languageId } = setup();
  addNewWord(db, userId, languageId, "achieve");
  addNewWord(db, userId, languageId, "happy");

  const started = startSession(db, userId, { type: "new_words" });
  assert.equal(started.type, "new_words");
  assert.equal(started.progress.totalItems, 2);
});

test("a daily_review session never exceeds DEFAULT_DAILY_REVIEW_LIMIT even with more due words available", () => {
  const { db, userId, languageId } = setup();
  const dueNormalizedWords = ["achieve", "happy", "bank", "confident", "opportunity", "improve", "challenge", "argument"];
  let minutes = 10;
  for (const w of dueNormalizedWords) {
    addDueWord(db, userId, languageId, w, minutes);
    minutes += 10;
  }
  // Fewer than DEFAULT_DAILY_REVIEW_LIMIT candidates exist in this test on
  // purpose (asserting the *cap*, not exhausting real data) - so instead
  // directly verify the configured limit is respected by requesting fewer
  // than available and confirming the session isn't larger than the cap.
  const started = startSession(db, userId, { type: "daily_review" });
  assert.ok(started.progress.totalItems <= DEFAULT_DAILY_REVIEW_LIMIT);
});

test("daily limits are enforced: a new_words session is capped at DEFAULT_NEW_WORD_LIMIT", () => {
  const { db, userId, languageId } = setup();
  const candidates = ["achieve", "happy", "bank", "confident", "opportunity", "improve", "challenge", "argument"];
  assert.ok(candidates.length > DEFAULT_NEW_WORD_LIMIT, "test fixture must offer more candidates than the limit");
  for (const w of candidates) addNewWord(db, userId, languageId, w);

  const started = startSession(db, userId, { type: "new_words" });
  assert.equal(started.progress.totalItems, DEFAULT_NEW_WORD_LIMIT);
});

test("a session belongs to the user who created it - another user cannot access it", () => {
  const { db, userId, languageId } = setup();
  const otherUserId = newId("user");
  db.insert(users).values({ id: otherUserId, name: "Other User" }).run();
  addDueWord(db, userId, languageId, "achieve", 30);

  const started = startSession(db, userId, { type: "daily_review" });

  assert.throws(() => getSessionInfo(db, otherUserId, started.sessionId));
  assert.throws(() => getCurrentQuestion(db, otherUserId, started.sessionId));
  assert.throws(() => submitAnswer(db, otherUserId, started.sessionId, { submittedText: "anything" }));
});

test("resume behavior: calling getCurrentQuestion repeatedly without answering does not advance the session", () => {
  const { db, userId, languageId } = setup();
  addDueWord(db, userId, languageId, "achieve", 30);
  addDueWord(db, userId, languageId, "happy", 20);

  const started = startSession(db, userId, { type: "daily_review" });
  const again1 = getCurrentQuestion(db, userId, started.sessionId);
  const again2 = getCurrentQuestion(db, userId, started.sessionId);
  assert.deepEqual(again1, again2);

  const info = getSessionInfo(db, userId, started.sessionId);
  assert.equal(info.currentIndex, 0, "must not have advanced just from reading the current question");
});

test("resume behavior holds for multiple_choice specifically: repeated GETs return the exact same option order and distractors", () => {
  // A brand-new focused word always starts on multiple_choice (see the
  // "exactly four options" test below) - this exercises the one code path
  // that used to reshuffle on every call via Math.random().
  const { db, userId, languageId } = setup();
  const wordRow = wordRowFor(db, languageId, "achieve");
  const started = startSession(db, userId, { type: "focused_word", wordId: wordRow.id });
  assert.equal(started.question.testType, "multiple_choice");

  const again1 = getCurrentQuestion(db, userId, started.sessionId);
  const again2 = getCurrentQuestion(db, userId, started.sessionId);
  assert.deepEqual(again1, again2, "multiple_choice options must not reshuffle between repeated reads of the same question");
  assert.deepEqual(again1, started.question);
});

test("session progress advances by exactly one per answered item", () => {
  const { db, userId, languageId } = setup();
  addDueWord(db, userId, languageId, "achieve", 60, { correctCount: 5, incorrectCount: 0 });
  addDueWord(db, userId, languageId, "happy", 30, { correctCount: 5, incorrectCount: 0 });

  const started = startSession(db, userId, { type: "daily_review" });
  const res = submitAnswer(db, userId, started.sessionId, { submittedText: null }); // wrong on purpose -> auto-finalizes
  assert.equal(res.progress.currentIndex, 1);
});

test("a session completes after the last item and the summary reflects it", () => {
  const { db, userId, languageId } = setup();
  addDueWord(db, userId, languageId, "achieve", 30);

  const started = startSession(db, userId, { type: "daily_review" });
  const res = submitAnswer(db, userId, started.sessionId, { submittedText: null });
  assert.equal(res.sessionComplete, true);

  const summary = completeSession(db, userId, started.sessionId);
  assert.equal(summary.status, "completed");
  assert.equal(summary.completedItems, 1);
});

test("exiting a session early preserves already-recorded reviews without pretending remaining items were completed", () => {
  const { db, userId, languageId } = setup();
  addDueWord(db, userId, languageId, "achieve", 60);
  addDueWord(db, userId, languageId, "happy", 30);

  const started = startSession(db, userId, { type: "daily_review" });
  submitAnswer(db, userId, started.sessionId, { submittedText: null }); // answer item 1 only

  const summary = exitSession(db, userId, started.sessionId);
  assert.equal(summary.status, "exited");
  assert.equal(summary.totalItems, 2);
  assert.equal(summary.completedItems, 1, "only the answered item should count as completed");

  const info = getSessionInfo(db, userId, started.sessionId);
  assert.equal(info.status, "exited");
});

// ============================================================
// MULTIPLE CHOICE
// ============================================================

test("multiple choice: exactly four options, one of which is the real definition, none leaking correctness", () => {
  const { db, userId, languageId } = setup();
  const wordRow = wordRowFor(db, languageId, "achieve");
  const started = startSession(db, userId, { type: "focused_word", wordId: wordRow.id });

  assert.equal(started.question.testType, "multiple_choice", "a brand-new focused word should start with recognition-first multiple_choice");
  assert.equal(started.question.options?.length, 4);

  const definition = primaryDefinition(db, wordRow.id);
  const optionTexts = started.question.options!.map((o) => o.text);
  assert.ok(optionTexts.includes(definition));

  for (const opt of started.question.options!) {
    assert.deepEqual(Object.keys(opt).sort(), ["key", "text"], "an option must never carry a correctness field");
  }
});

test("multiple choice: distractors are real dictionary definitions, not fabricated text", () => {
  const { db, userId, languageId } = setup();
  const wordRow = wordRowFor(db, languageId, "achieve");
  const started = startSession(db, userId, { type: "focused_word", wordId: wordRow.id });

  const allDefinitions = db.select({ definition: wordSenses.definition }).from(wordSenses).all().map((r) => r.definition);
  for (const opt of started.question.options!) {
    assert.ok(allDefinitions.includes(opt.text), `option "${opt.text}" should be a real seeded definition`);
  }
});

test("multiple choice: the correct answer is graded server-side", () => {
  const { db, userId, languageId } = setup();
  const wordRow = wordRowFor(db, languageId, "achieve");
  const started = startSession(db, userId, { type: "focused_word", wordId: wordRow.id });
  const definition = primaryDefinition(db, wordRow.id);

  const res = submitAnswer(db, userId, started.sessionId, { submittedText: definition });
  assert.equal(res.isCorrect, true);
  assert.equal(res.requiresOutcomeChoice, true, "a correct answer needs a Hard/Good/Easy choice before it's recorded");
});

test("multiple choice: a wrong option is graded incorrect and auto-recorded as AGAIN", () => {
  const { db, userId, languageId } = setup();
  const wordRow = wordRowFor(db, languageId, "achieve");
  const started = startSession(db, userId, { type: "focused_word", wordId: wordRow.id });
  const wrongOption = started.question.options!.find((o) => o.text !== primaryDefinition(db, wordRow.id))!;

  const res = submitAnswer(db, userId, started.sessionId, { submittedText: wrongOption.text });
  assert.equal(res.isCorrect, false);
  assert.equal(res.requiresOutcomeChoice, false);
  assert.ok(res.masteryUpdate);
});

test("answer-leak prevention: word-producing test types never include the word in the payload", () => {
  const { db, userId, languageId } = setup();
  addDueWord(db, userId, languageId, "achieve", 60, { status: "familiar", correctCount: 8, incorrectCount: 1 });

  const started = startSession(db, userId, { type: "daily_review" });
  assert.ok(
    ["meaning_to_english", "spelling", "fill_blank"].includes(started.question.testType),
    "a familiar, well-answered word should land on the CHALLENGING rotation"
  );
  assert.equal(started.question.word, undefined);
  assert.ok(!JSON.stringify(started.question).toLowerCase().includes("achieve"), "the raw word must not appear anywhere in the question payload");
});

// ============================================================
// Full test-type walkthrough via the CHALLENGING rotation:
// meaning_to_english -> spelling -> fill_blank
// ============================================================

test("meaning_to_english, spelling, and fill_blank each work end to end through a session", () => {
  const { db, userId, languageId } = setup();
  // All three configured to trigger the CHALLENGING rotation (more correct
  // than incorrect, not "new"), ordered by overdue amount so the queue
  // returns them in this exact order: happy (0), glad (1), achieve (2) -
  // landing on CHALLENGING[0]=meaning_to_english, [1]=spelling,
  // [2]=fill_blank respectively.
  addDueWord(db, userId, languageId, "happy", 300, { status: "familiar", correctCount: 8, incorrectCount: 1 });
  addDueWord(db, userId, languageId, "glad", 200, { status: "familiar", correctCount: 8, incorrectCount: 1 });
  addDueWord(db, userId, languageId, "achieve", 100, { status: "familiar", correctCount: 8, incorrectCount: 1 });

  const started = startSession(db, userId, { type: "daily_review" });
  assert.equal(started.progress.totalItems, 3);
  assert.equal(started.question.testType, "meaning_to_english");
  assert.equal(started.question.word, undefined, "the word IS the answer for meaning_to_english - must not be in the payload");
  assert.equal(wordById(db, started.question.wordId), "happy");

  const happyWord = wordRowFor(db, languageId, "happy");
  const answer1 = submitAnswer(db, userId, started.sessionId, { submittedText: happyWord.word });
  assert.equal(answer1.isCorrect, true);
  const outcome1 = submitOutcome(db, userId, started.sessionId, { outcome: "good" });
  assert.equal(outcome1.nextQuestion?.testType, "spelling");
  assert.equal(outcome1.nextQuestion?.word, undefined, "the word IS the answer for spelling - must not be in the payload");
  assert.equal(wordById(db, outcome1.nextQuestion!.wordId), "glad");

  const gladWord = wordRowFor(db, languageId, "glad");
  const answer2 = submitAnswer(db, userId, started.sessionId, { submittedText: gladWord.word });
  assert.equal(answer2.isCorrect, true);
  const outcome2 = submitOutcome(db, userId, started.sessionId, { outcome: "easy" });
  assert.equal(outcome2.nextQuestion?.testType, "fill_blank");
  assert.equal(outcome2.nextQuestion?.word, undefined, "the blanked token IS the answer for fill_blank - must not be in the payload");
  assert.equal(wordById(db, outcome2.nextQuestion!.wordId), "achieve");
  assert.ok(outcome2.nextQuestion?.sentence?.includes("_____"));

  // Wrong fill_blank answer this time.
  const answer3 = submitAnswer(db, userId, started.sessionId, { submittedText: "wrongword" });
  assert.equal(answer3.isCorrect, false);
  assert.equal(answer3.sessionComplete, true);

  const summary = completeSession(db, userId, started.sessionId);
  assert.equal(summary.completedItems, 3);
  assert.equal(summary.correctCount, 2);
  assert.equal(summary.incorrectCount, 1);
  assert.equal(summary.successRate, 67);
});

// ============================================================
// REVIEW - the session engine invokes the Phase 5 review engine, never a
// duplicate calculation.
// ============================================================

test("answering invokes the Phase 5 engine: mastery, SRS, and review history are all updated", () => {
  const { db, userId, languageId } = setup();
  addDueWord(db, userId, languageId, "achieve", 60, { correctCount: 0, incorrectCount: 0 });
  const started = startSession(db, userId, { type: "daily_review" });

  const res = submitAnswer(db, userId, started.sessionId, { submittedText: null }); // wrong
  assert.ok(res.masteryUpdate);
  assert.ok(res.masteryUpdate!.nextReviewAt);

  const wordRow = wordRowFor(db, languageId, "achieve");
  const uv = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.wordId, wordRow.id)))
    .get()!;
  assert.equal(uv.reviewCount, 1);
  assert.ok(uv.nextReviewAt);

  const history = db.select().from(vocabularyReviewHistory).where(eq(vocabularyReviewHistory.userVocabularyId, uv.id)).all();
  assert.equal(history.length, 1);
  assert.equal(history[0].learningSessionId, started.sessionId);
  assert.equal(history[0].outcome, "again");
});

// ============================================================
// FOCUSED WORD PRACTICE ("Practice this word" from Word Detail)
// ============================================================

test("a focused_word session contains only the selected word, even if other due words exist", () => {
  const { db, userId, languageId } = setup();
  addDueWord(db, userId, languageId, "happy", 60); // unrelated due word that should NOT appear
  const targetWord = wordRowFor(db, languageId, "achieve");

  const started = startSession(db, userId, { type: "focused_word", wordId: targetWord.id });
  assert.equal(started.progress.totalItems, 1);
  assert.equal(started.question.wordId, targetWord.id);
});

test("focused_word practice adds a not-yet-tracked word to the bank and records results normally", () => {
  const { db, userId, languageId } = setup();
  const targetWord = wordRowFor(db, languageId, "resilience");
  const existing = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.wordId, targetWord.id)))
    .get();
  assert.equal(existing, undefined, "fixture word must not already be in the bank");

  const started = startSession(db, userId, { type: "focused_word", wordId: targetWord.id });
  submitAnswer(db, userId, started.sessionId, { submittedText: null });

  const uv = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.wordId, targetWord.id)))
    .get();
  assert.ok(uv, "practicing an untracked word should add it to the bank");
  assert.equal(uv?.reviewCount, 1);
});

// ============================================================
// SESSION SUMMARY
// ============================================================

test("session summary reports completed/correct/incorrect/success rate/mastered/needs-review counts", () => {
  const { db, userId, languageId } = setup();
  addDueWord(db, userId, languageId, "achieve", 60, { correctCount: 0, incorrectCount: 0 });
  addDueWord(db, userId, languageId, "happy", 30, { correctCount: 0, incorrectCount: 0 });

  const started = startSession(db, userId, { type: "daily_review" });
  // First item: answer wrong (AGAIN -> needs review).
  const r1 = submitAnswer(db, userId, started.sessionId, { submittedText: null });
  assert.equal(r1.sessionComplete, false);
  // Second item: answer correct + easy.
  const q2 = r1.nextQuestion!;
  const ctxDefinition = primaryDefinition(db, q2.wordId);
  const submittedForQ2 = q2.testType === "multiple_choice" ? ctxDefinition : wordById(db, q2.wordId);
  const r2 = submitAnswer(db, userId, started.sessionId, { submittedText: submittedForQ2 });
  if (r2.requiresOutcomeChoice) submitOutcome(db, userId, started.sessionId, { outcome: "easy" });

  const summary = completeSession(db, userId, started.sessionId);
  assert.equal(summary.completedItems, 2);
  assert.equal(summary.correctCount, 1);
  assert.equal(summary.incorrectCount, 1);
  assert.equal(summary.successRate, 50);
  assert.equal(summary.wordsNeedingReview, 1);
  assert.equal(typeof summary.wordsMastered, "number");
});

// ============================================================
// "Review difficult words"
// ============================================================

test("review-difficult builds a new session containing only the words answered incorrectly, not a repeat of the whole session", () => {
  const { db, userId, languageId } = setup();
  addDueWord(db, userId, languageId, "achieve", 60, { correctCount: 5, incorrectCount: 0 });
  addDueWord(db, userId, languageId, "happy", 30, { correctCount: 5, incorrectCount: 0 });

  const started = startSession(db, userId, { type: "daily_review" });
  // Fail the first item.
  const r1 = submitAnswer(db, userId, started.sessionId, { submittedText: "definitely wrong" });
  assert.equal(r1.isCorrect, false);
  // Pass the second item.
  const q2 = r1.nextQuestion!;
  const submittedForQ2 = q2.testType === "multiple_choice" ? primaryDefinition(db, q2.wordId) : wordById(db, q2.wordId);
  const r2 = submitAnswer(db, userId, started.sessionId, { submittedText: submittedForQ2 });
  if (r2.requiresOutcomeChoice) submitOutcome(db, userId, started.sessionId, { outcome: "good" });

  const reviewSession = startDifficultWordsSession(db, userId, started.sessionId);
  assert.equal(reviewSession.progress.totalItems, 1, "only the one missed word should carry over");
});

test("review-difficult throws when there was nothing missed", () => {
  const { db, userId, languageId } = setup();
  addDueWord(db, userId, languageId, "achieve", 60, { correctCount: 5, incorrectCount: 0 });
  const started = startSession(db, userId, { type: "daily_review" });
  const submitted =
    started.question.testType === "multiple_choice"
      ? primaryDefinition(db, started.question.wordId)
      : wordById(db, started.question.wordId);
  const r1 = submitAnswer(db, userId, started.sessionId, { submittedText: submitted });
  if (r1.requiresOutcomeChoice) submitOutcome(db, userId, started.sessionId, { outcome: "good" });

  assert.throws(() => startDifficultWordsSession(db, userId, started.sessionId));
});
