import { and, desc, eq } from "drizzle-orm";
import type { db as RealDb } from "../../db/client.js";
import { userVocabulary, vocabularyReviewHistory } from "../../db/schema.js";
import { newId } from "../../lib/ids.js";
import { evaluateMastery, isSuccessOutcome } from "../mastery/engine.js";
import type { ReviewEvent } from "../mastery/types.js";
import { modifiedSm2Engine, nextReviewDate } from "../spaced-repetition/srsEngine.js";
import type { SrsState } from "../spaced-repetition/types.js";
import type { RecordReviewInput, RecordReviewResult } from "./types.js";

type Db = typeof RealDb;

function outcomeToResult(outcome: RecordReviewInput["outcome"]): "correct" | "incorrect" | "partial" {
  if (outcome === "again" || outcome === "dont_know") return "incorrect";
  if (outcome === "hard") return "partial";
  return "correct";
}

function latestSrsState(
  db: Db,
  userVocabularyId: string
): SrsState {
  const latest = db
    .select({
      intervalDays: vocabularyReviewHistory.newIntervalDays,
      easeFactor: vocabularyReviewHistory.easeFactor,
      repetitions: vocabularyReviewHistory.repetitions,
    })
    .from(vocabularyReviewHistory)
    .where(eq(vocabularyReviewHistory.userVocabularyId, userVocabularyId))
    .orderBy(desc(vocabularyReviewHistory.reviewedAt))
    .limit(1)
    .get();

  if (!latest) return modifiedSm2Engine.initialState();
  return latest;
}

// The one place a review is recorded: computes mastery + scheduling from
// the word's FULL history (never just the latest event), writes an
// immutable history row, and updates the live rollup on user_vocabulary.
// The caller (routes layer) never supplies mastery/status/interval - only
// userVocabularyId + testType + outcome + optional response time.
export function recordReview(db: Db, userId: string, input: RecordReviewInput): RecordReviewResult {
  const uv = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.id, input.userVocabularyId), eq(userVocabulary.userId, userId)))
    .get();
  if (!uv) throw new Error("Word not found in your vocabulary.");

  const now = new Date();
  const nowIso = now.toISOString();

  const priorHistory = db
    .select({ testType: vocabularyReviewHistory.testType, outcome: vocabularyReviewHistory.outcome, reviewedAt: vocabularyReviewHistory.reviewedAt })
    .from(vocabularyReviewHistory)
    .where(eq(vocabularyReviewHistory.userVocabularyId, uv.id))
    .all();

  const events: ReviewEvent[] = [
    ...priorHistory.map((h) => ({ testType: h.testType, outcome: h.outcome, occurredAt: h.reviewedAt })),
    { testType: input.testType, outcome: input.outcome, occurredAt: nowIso },
  ];

  const mastery = evaluateMastery(events);
  const successful = isSuccessOutcome(input.outcome);

  const priorSrsState = latestSrsState(db, uv.id);
  const newSrsState = modifiedSm2Engine.scheduleNext(priorSrsState, input.outcome);
  const nextReviewIso = nextReviewDate(newSrsState.intervalDays, now).toISOString();

  const wasDue = uv.nextReviewAt === null || new Date(uv.nextReviewAt.includes("T") ? uv.nextReviewAt : `${uv.nextReviewAt.replace(" ", "T")}Z`) <= now;

  // Needs-review is event-driven: a failure sets it, a success clears it.
  // Decay-driven "should this come back for review" is a separate,
  // read-time concern handled by the queue (see queueService.ts) rather
  // than persisted here, since it requires no background sweep this way.
  const needsReview = !successful;

  db.insert(vocabularyReviewHistory)
    .values({
      id: newId("review"),
      userVocabularyId: uv.id,
      testType: input.testType,
      result: outcomeToResult(input.outcome),
      outcome: input.outcome,
      previousScore: uv.masteryScore,
      newScore: mastery.overallScore,
      previousIntervalDays: priorSrsState.intervalDays,
      newIntervalDays: newSrsState.intervalDays,
      easeFactor: newSrsState.easeFactor,
      repetitions: newSrsState.repetitions,
      nextReviewAt: nextReviewIso,
      wasDue,
      successful,
      responseTimeMs: input.responseTimeMs,
      reviewedAt: nowIso,
    })
    .run();

  db.update(userVocabulary)
    .set({
      status: mastery.status,
      masteryScore: mastery.overallScore,
      confidenceScore: mastery.overallScore,
      needsReview,
      reviewCount: uv.reviewCount + 1,
      correctCount: uv.correctCount + (successful ? 1 : 0),
      incorrectCount: uv.incorrectCount + (successful ? 0 : 1),
      consecutiveCorrect: successful ? uv.consecutiveCorrect + 1 : 0,
      lastReviewedAt: nowIso,
      nextReviewAt: nextReviewIso,
      learnedAt: uv.learnedAt ?? (mastery.status !== "new" ? nowIso : null),
      updatedAt: nowIso,
    })
    .where(eq(userVocabulary.id, uv.id))
    .run();

  return {
    userVocabularyId: uv.id,
    previousStatus: uv.status,
    newStatus: mastery.status,
    previousMasteryScore: uv.masteryScore,
    newMasteryScore: mastery.overallScore,
    effectiveMasteryScore: mastery.overallScore, // fresh off a review, effective == base (no decay yet)
    needsReview,
    previousIntervalDays: priorSrsState.intervalDays,
    newIntervalDays: newSrsState.intervalDays,
    nextReviewAt: nextReviewIso,
    wasDue,
    successful,
  };
}

// "I don't know this word" - reusable, per Phase 4's original design
// intent, but now a real learning-engine event rather than a hard reset.
// If the word isn't in the bank yet, it's added first (status starts at
// "new", matching Add Word), then a genuine `dont_know` review event is
// recorded so the negative signal is preserved in history rather than
// discarded. If the word already has history (even a mastered word), this
// only nudges its evidence down and schedules a near-term review - it
// never erases prior reviews or resets mastery to zero.
export function recordDontKnow(db: Db, userId: string, wordId: string): RecordReviewResult {
  let uv = db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.wordId, wordId)))
    .get();

  if (!uv) {
    const id = newId("uv");
    db.insert(userVocabulary)
      .values({ id, userId, wordId, status: "new", knownBeforeApp: false, masteryScore: 0, confidenceScore: 0 })
      .run();
    uv = db.select().from(userVocabulary).where(eq(userVocabulary.id, id)).get()!;
  }

  // "english_to_meaning" (recall) is the closest real test-type semantic
  // to a direct self-report of not knowing what a word means.
  return recordReview(db, userId, { userVocabularyId: uv.id, testType: "english_to_meaning", outcome: "dont_know" });
}
