import { and, eq } from "drizzle-orm";
import type { db as RealDb } from "../../db/client.js";
import { words, wordSenses, assessmentSessions, assessmentResponses } from "../../db/schema.js";
import { newId } from "../../lib/ids.js";
import { LOCAL_USER_ID } from "../users/localUser.js";
import { getEnglishLanguageId } from "../dictionary/language.js";
import { upsertUserVocabulary } from "../vocabulary-bank/service.js";
import { MAX_QUESTIONS, STARTING_TIER, nextTier, shouldContinue } from "./adaptiveEngine.js";
import { buildQuestion, type WordWithSense } from "./questionBank.js";
import { computeResult, type AssessmentResultPayload } from "./scoring.js";
import type { AssessmentQuestion, Tier } from "./types.js";

// Accepts any drizzle db instance (the real one, or an in-memory test db)
// so this module - and its adaptive/scoring logic - can be exercised in
// isolated tests against real seeded data instead of mocks.
type Db = typeof RealDb;

interface WordPool {
  beginner: WordWithSense[];
  intermediate: WordWithSense[];
  advanced: WordWithSense[];
}

function loadWordPool(db: Db, languageId: string): WordPool {
  const rows = db
    .select({
      id: words.id,
      word: words.word,
      difficultyLevel: words.difficultyLevel,
      definition: wordSenses.definition,
      partOfSpeech: wordSenses.partOfSpeech,
    })
    .from(words)
    .innerJoin(wordSenses, and(eq(wordSenses.wordId, words.id), eq(wordSenses.senseOrder, 0)))
    .where(eq(words.languageId, languageId))
    .all();

  const pool: WordPool = { beginner: [], intermediate: [], advanced: [] };
  for (const row of rows) {
    if (!row.difficultyLevel) continue;
    pool[row.difficultyLevel as Tier].push(row);
  }
  return pool;
}

function poolTotal(pool: WordPool): number {
  return pool.beginner.length + pool.intermediate.length + pool.advanced.length;
}

function allWords(pool: WordPool): WordWithSense[] {
  return [...pool.beginner, ...pool.intermediate, ...pool.advanced];
}

// Picks an unused word from the requested tier; if that tier is
// exhausted, falls back to the nearest other tier so an assessment never
// dead-ends just because one band ran out of fresh words.
function pickWord(pool: WordPool, tier: Tier, usedWordIds: Set<string>): WordWithSense | null {
  const order: Tier[] =
    tier === "beginner"
      ? ["beginner", "intermediate", "advanced"]
      : tier === "advanced"
        ? ["advanced", "intermediate", "beginner"]
        : ["intermediate", "advanced", "beginner"];

  for (const t of order) {
    const candidates = pool[t].filter((w) => !usedWordIds.has(w.id));
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }
  return null;
}

export interface AssessmentProgress {
  current: number;
  total: number;
}

export interface StartAssessmentResult {
  sessionId: string;
  question: AssessmentQuestion;
  progress: AssessmentProgress;
}

export function startAssessment(db: Db, userId: string = LOCAL_USER_ID): StartAssessmentResult {
  const languageId = getEnglishLanguageId(db);
  const pool = loadWordPool(db, languageId);
  const total = Math.min(MAX_QUESTIONS, poolTotal(pool));
  if (total === 0) {
    throw new Error("Not enough seeded vocabulary to run an assessment.");
  }

  const sessionId = newId("assess");
  db.insert(assessmentSessions).values({ id: sessionId, userId, status: "in_progress" }).run();

  const picked = pickWord(pool, STARTING_TIER, new Set());
  if (!picked) {
    throw new Error("Not enough seeded vocabulary to run an assessment.");
  }

  const question = buildQuestion(picked, allWords(pool));
  return { sessionId, question, progress: { current: 1, total } };
}

export interface SubmitAnswerInput {
  wordId: string;
  selectedOptionText: string | null; // null = "I don't know"
  responseTimeMs?: number;
}

export interface AssessmentResult extends AssessmentResultPayload {
  sessionId: string;
  isBaseline: boolean;
}

export interface SubmitAnswerResult {
  nextQuestion: AssessmentQuestion | null;
  progress: AssessmentProgress | null;
  result: AssessmentResult | null;
}

export function submitAnswer(db: Db, sessionId: string, input: SubmitAnswerInput): SubmitAnswerResult {
  const session = db.select().from(assessmentSessions).where(eq(assessmentSessions.id, sessionId)).get();
  if (!session) throw new Error("Assessment session not found.");
  if (session.status !== "in_progress") throw new Error("This assessment session has already been completed.");

  const wordRow = db
    .select({ id: words.id, difficultyLevel: words.difficultyLevel, definition: wordSenses.definition })
    .from(words)
    .innerJoin(wordSenses, and(eq(wordSenses.wordId, words.id), eq(wordSenses.senseOrder, 0)))
    .where(eq(words.id, input.wordId))
    .get();
  if (!wordRow) throw new Error("Word not found.");

  const dontKnow = input.selectedOptionText === null;
  const isCorrect = !dontKnow && input.selectedOptionText === wordRow.definition;

  db.insert(assessmentResponses)
    .values({
      id: newId("aresp"),
      assessmentSessionId: sessionId,
      wordId: input.wordId,
      difficultyLevel: wordRow.difficultyLevel ?? "intermediate",
      selectedOption: input.selectedOptionText,
      correctOption: wordRow.definition,
      isCorrect,
      dontKnow,
      responseTimeMs: input.responseTimeMs,
    })
    .run();

  const priorResponses = db
    .select()
    .from(assessmentResponses)
    .where(eq(assessmentResponses.assessmentSessionId, sessionId))
    .all();

  const languageId = getEnglishLanguageId(db);
  const pool = loadWordPool(db, languageId);
  const total = Math.min(MAX_QUESTIONS, poolTotal(pool));

  if (!shouldContinue(priorResponses.length, total)) {
    const result = completeAssessment(db, sessionId, session.userId, priorResponses);
    return { nextQuestion: null, progress: null, result };
  }

  const usedWordIds = new Set(priorResponses.map((r) => r.wordId));
  const lastTier = (wordRow.difficultyLevel ?? "intermediate") as Tier;
  const targetTier = nextTier(lastTier, isCorrect);

  const picked = pickWord(pool, targetTier, usedWordIds);
  if (!picked) {
    const result = completeAssessment(db, sessionId, session.userId, priorResponses);
    return { nextQuestion: null, progress: null, result };
  }

  const question = buildQuestion(picked, allWords(pool));
  return {
    nextQuestion: question,
    progress: { current: priorResponses.length + 1, total },
    result: null,
  };
}

function completeAssessment(
  db: Db,
  sessionId: string,
  userId: string,
  responses: (typeof assessmentResponses.$inferSelect)[]
): AssessmentResult {
  const stats = computeResult(responses);

  // Baseline = the user's first-ever completed assessment. This is the
  // "initial_known_words" / "initial_learning_words" reference point later
  // statistics compare against to show genuine vocabulary growth.
  const priorCompleted = db
    .select()
    .from(assessmentSessions)
    .where(and(eq(assessmentSessions.userId, userId), eq(assessmentSessions.status, "completed")))
    .all();
  const isBaseline = priorCompleted.length === 0;

  db.update(assessmentSessions)
    .set({
      status: "completed",
      completedAt: new Date().toISOString(),
      estimatedVocabularySize: stats.estimatedVocabularySize,
      estimatedLevel: stats.estimatedLevel,
      confidence: stats.confidence,
      knownWordCount: stats.knownWordCount,
      learningWordCount: stats.learningWordCount,
      isBaseline,
    })
    .where(eq(assessmentSessions.id, sessionId))
    .run();

  // Reuses the shared upsert (see vocabulary-bank/service.ts) - the same
  // function "Add Word" and "I don't know this word" use - so re-assessing
  // a word already in the bank updates it in place instead of violating
  // the (user_id, word_id) uniqueness constraint.
  for (const r of responses) {
    const known = r.isCorrect && !r.dontKnow;
    upsertUserVocabulary(db, userId, r.wordId, {
      // Recognized correctly during assessment = "familiar" (they
      // recognize it), never "mastered" - the assessment only tests
      // recognition, not active production/usage.
      status: known ? "familiar" : "new",
      knownBeforeApp: known,
      masteryScore: known ? 60 : 0,
      confidenceScore: known ? 70 : 0,
    });
  }

  return { sessionId, ...stats, isBaseline };
}
