import { test } from "node:test";
import assert from "node:assert/strict";
import { eq, and } from "drizzle-orm";
import { createTestDb } from "../../db/testUtils.js";
import { seedEnglishLanguage, seedWords } from "../../db/seed.js";
import {
  languages,
  words,
  wordSenses,
  users,
  assessmentSessions,
  assessmentResponses,
  userVocabulary,
} from "../../db/schema.js";
import { newId } from "../../lib/ids.js";
import { startAssessment, submitAnswer, type AssessmentResult } from "./service.js";
import type { AssessmentQuestion } from "./types.js";

type TestDb = ReturnType<typeof createTestDb>["db"];

function setup() {
  const { db } = createTestDb();
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();
  const languageId = seedEnglishLanguage(db);
  seedWords(db, languageId);
  return { db, userId };
}

function correctAnswerFor(db: TestDb, wordId: string): string {
  const row = db
    .select({ definition: wordSenses.definition })
    .from(wordSenses)
    .where(and(eq(wordSenses.wordId, wordId), eq(wordSenses.senseOrder, 0)))
    .get();
  if (!row) throw new Error("fixture word has no primary sense");
  return row.definition;
}

interface SeenAnswer {
  wordId: string;
  difficultyLevel: string;
}

function runFullAssessment(
  db: TestDb,
  userId: string,
  answer: (wordId: string, correctText: string) => string | null
): { sessionId: string; result: AssessmentResult; seen: SeenAnswer[] } {
  const started = startAssessment(db, userId);
  let sessionId = started.sessionId;
  let question: AssessmentQuestion = started.question;
  const seen: SeenAnswer[] = [];

  for (;;) {
    const correctText = correctAnswerFor(db, question.wordId);
    const selected = answer(question.wordId, correctText);
    seen.push({ wordId: question.wordId, difficultyLevel: question.difficultyLevel });
    const res = submitAnswer(db, sessionId, { wordId: question.wordId, selectedOptionText: selected });
    if (res.result) return { sessionId, result: res.result, seen };
    question = res.nextQuestion!;
  }
}

function seedTinyVocabulary(db: TestDb): void {
  const languageId = newId("lang");
  db.insert(languages).values({ id: languageId, code: "en", name: "English", nativeName: "English" }).run();
  const fixtures: { word: string; difficultyLevel: "beginner" | "intermediate" | "advanced" }[] = [
    { word: "alpha", difficultyLevel: "beginner" },
    { word: "beta", difficultyLevel: "intermediate" },
    { word: "gamma", difficultyLevel: "advanced" },
  ];
  for (const f of fixtures) {
    const wordId = newId("word");
    db.insert(words)
      .values({ id: wordId, languageId, word: f.word, normalizedWord: f.word, difficultyLevel: f.difficultyLevel })
      .run();
    db.insert(wordSenses)
      .values({ id: newId("sense"), wordId, definition: `Definition of ${f.word}.`, partOfSpeech: "noun", senseOrder: 0 })
      .run();
  }
}

test("an assessment can start and returns a real question", () => {
  const { db, userId } = setup();
  const started = startAssessment(db, userId);
  assert.ok(started.sessionId);
  assert.ok(started.question.wordId);
  assert.equal(started.question.options.length, 4);
  assert.equal(started.progress.current, 1);
});

test("questions are retrieved from real seeded word data, not hard-coded", () => {
  const { db, userId } = setup();
  const started = startAssessment(db, userId);
  const wordRow = db.select().from(words).where(eq(words.id, started.question.wordId)).get();
  assert.equal(started.question.word, wordRow?.word);
});

test("an assessment covers more than one difficulty tier", () => {
  const { db, userId } = setup();
  let toggle = true;
  const { seen } = runFullAssessment(db, userId, (_wordId, correctText) => {
    toggle = !toggle;
    return toggle ? correctText : null;
  });
  const tiersSeen = new Set(seen.map((s) => s.difficultyLevel));
  assert.ok(tiersSeen.size > 1, `expected more than one tier, got ${[...tiersSeen]}`);
});

test("a correct answer is recorded as correct", () => {
  const { db, userId } = setup();
  const started = startAssessment(db, userId);
  const correctText = correctAnswerFor(db, started.question.wordId);
  submitAnswer(db, started.sessionId, { wordId: started.question.wordId, selectedOptionText: correctText });

  const row = db.select().from(assessmentResponses).where(eq(assessmentResponses.wordId, started.question.wordId)).get();
  assert.equal(row?.isCorrect, true);
  assert.equal(row?.dontKnow, false);
});

test("an incorrect answer is recorded as incorrect", () => {
  const { db, userId } = setup();
  const started = startAssessment(db, userId);
  submitAnswer(db, started.sessionId, {
    wordId: started.question.wordId,
    selectedOptionText: "This is definitely the wrong definition text.",
  });

  const row = db.select().from(assessmentResponses).where(eq(assessmentResponses.wordId, started.question.wordId)).get();
  assert.equal(row?.isCorrect, false);
  assert.equal(row?.dontKnow, false);
});

test('"I don\'t know" is recorded distinctly from a wrong guess', () => {
  const { db, userId } = setup();
  const started = startAssessment(db, userId);
  submitAnswer(db, started.sessionId, { wordId: started.question.wordId, selectedOptionText: null });

  const row = db.select().from(assessmentResponses).where(eq(assessmentResponses.wordId, started.question.wordId)).get();
  assert.equal(row?.isCorrect, false);
  assert.equal(row?.dontKnow, true);
});

test("assessment history is preserved across multiple sessions", () => {
  const { db, userId } = setup();
  runFullAssessment(db, userId, () => null);
  runFullAssessment(db, userId, () => null);

  const sessions = db.select().from(assessmentSessions).where(eq(assessmentSessions.userId, userId)).all();
  assert.equal(sessions.length, 2);
  assert.ok(sessions.every((s) => s.status === "completed"));
});

test("words known before the app are not counted as newly learned", () => {
  const { db, userId } = setup();
  const { result } = runFullAssessment(db, userId, (_wordId, correctText) => correctText);

  assert.equal(result.knownWordCount, result.totalQuestions);
  assert.equal(result.learningWordCount, 0);

  const knownRows = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.knownBeforeApp, true)))
    .all();
  assert.ok(knownRows.length > 0);
  assert.ok(knownRows.every((r) => r.status === "familiar"));
});

test("unknown words are added to user_vocabulary as new", () => {
  const { db, userId } = setup();
  runFullAssessment(db, userId, () => null);

  const newRows = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.status, "new")))
    .all();
  assert.ok(newRows.length > 0);
  assert.ok(newRows.every((r) => r.knownBeforeApp === false));
});

test("re-running an assessment does not create duplicate user_vocabulary records", () => {
  const { db } = createTestDb();
  const userId = newId("user");
  db.insert(users).values({ id: userId, name: "Test User" }).run();
  seedTinyVocabulary(db);

  runFullAssessment(db, userId, () => null); // exhausts all 3 seeded words
  runFullAssessment(db, userId, () => null); // necessarily reuses the same 3 words

  const rows = db.select().from(userVocabulary).where(eq(userVocabulary.userId, userId)).all();
  assert.equal(rows.length, 3, "expected exactly one user_vocabulary row per word, no duplicates");
});

test("the initial vocabulary baseline is stored on the first completed assessment only", () => {
  const { db, userId } = setup();
  const first = runFullAssessment(db, userId, (_wordId, correctText) => correctText);
  const second = runFullAssessment(db, userId, () => null);

  const firstSession = db.select().from(assessmentSessions).where(eq(assessmentSessions.id, first.sessionId)).get();
  const secondSession = db.select().from(assessmentSessions).where(eq(assessmentSessions.id, second.sessionId)).get();

  assert.equal(firstSession?.isBaseline, true);
  assert.equal(secondSession?.isBaseline, false);
  assert.equal(typeof firstSession?.estimatedVocabularySize, "number");
  assert.equal(typeof firstSession?.knownWordCount, "number");
  assert.equal(typeof firstSession?.learningWordCount, "number");
});
