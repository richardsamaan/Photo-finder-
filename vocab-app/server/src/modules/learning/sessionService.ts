import { and, asc, eq } from "drizzle-orm";
import type { db as RealDb } from "../../db/client.js";
import { learningSessions, userVocabulary, words, vocabularyReviewHistory } from "../../db/schema.js";
import { newId } from "../../lib/ids.js";
import { upsertUserVocabulary } from "../vocabulary-bank/service.js";
import type { VocabularyStatus, ReviewOutcome } from "../mastery/types.js";
import { recordReview } from "./reviewService.js";
import { getDueReviews, getNewWords } from "./queueService.js";
import { chooseTestType } from "./testTypeStrategy.js";
import { buildQuestion, getGradingContext, getPrimarySense, countDistractors, findBlankToken, isEligibleTestType } from "./questionBuilder.js";
import { gradeAnswer } from "./grading.js";
import { DEFAULT_DAILY_REVIEW_LIMIT, DEFAULT_NEW_WORD_LIMIT, MAX_SESSION_SIZE } from "./sessionConfig.js";
import type {
  RecordedMasteryUpdate,
  SessionItemResult,
  SessionPlanItem,
  SessionProgress,
  SessionQuestion,
  SessionSummary,
  SessionType,
  StartSessionInput,
  StartSessionResult,
  SubmitAnswerInput,
  SubmitAnswerResult,
  SubmitOutcomeInput,
  SubmitOutcomeResult,
} from "./sessionTypes.js";

type Db = typeof RealDb;
type SessionRow = typeof learningSessions.$inferSelect;

function parseItems(json: string): SessionPlanItem[] {
  return JSON.parse(json) as SessionPlanItem[];
}

function parseDbDate(value: string): Date {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

function getOwnedSession(db: Db, userId: string, sessionId: string): SessionRow {
  const session = db
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
    .get();
  if (!session) throw new Error("Session not found.");
  return session;
}

interface Candidate {
  userVocabularyId: string;
  wordId: string;
  status: VocabularyStatus;
  correctCount: number;
  incorrectCount: number;
}

// Shared by every session type: given a list of candidate words (already
// selected by the Phase 5 queue service, or explicit for focused/
// difficult-word sessions), assigns each an eligible test type and drops
// any word with no usable dictionary content. Never re-implements word
// *prioritization* - that always comes from queueService.ts.
function buildPlanFromCandidates(db: Db, candidates: Candidate[]): SessionPlanItem[] {
  const plan: SessionPlanItem[] = [];

  candidates.forEach((c, index) => {
    const sense = getPrimarySense(db, c.wordId);
    if (!sense) return;

    const wordRow = db.select().from(words).where(eq(words.id, c.wordId)).get();
    if (!wordRow) return;

    const distractorCount = countDistractors(db, wordRow.languageId, wordRow.id);
    const blankInfo = sense.exampleSentence ? findBlankToken(sense.exampleSentence, wordRow.normalizedWord) : null;

    const testType = chooseTestType(
      { status: c.status, correctCount: c.correctCount, incorrectCount: c.incorrectCount },
      index,
      (t) => isEligibleTestType(t, { sense, blankInfo, distractorCount })
    );
    if (!testType) return;

    plan.push({ userVocabularyId: c.userVocabularyId, wordId: c.wordId, testType });
  });

  return plan;
}

function buildSessionPlan(db: Db, userId: string, type: SessionType, wordId?: string): SessionPlanItem[] {
  let candidates: Candidate[];

  if (type === "focused_word") {
    if (!wordId) throw new Error("A word is required to practice a specific word.");
    const wordRow = db.select().from(words).where(eq(words.id, wordId)).get();
    if (!wordRow) throw new Error("Word not found.");

    let uv = db
      .select()
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.wordId, wordId)))
      .get();
    if (!uv) {
      // "Practice this word" on a word not yet in the bank - add it first,
      // matching Add Word's behavior (status new, not known-before-app).
      const { userVocabularyId } = upsertUserVocabulary(db, userId, wordId, {
        status: "new",
        knownBeforeApp: false,
        masteryScore: 0,
        confidenceScore: 0,
      });
      uv = db.select().from(userVocabulary).where(eq(userVocabulary.id, userVocabularyId)).get()!;
    }
    candidates = [
      { userVocabularyId: uv.id, wordId: uv.wordId, status: uv.status, correctCount: uv.correctCount, incorrectCount: uv.incorrectCount },
    ];
  } else if (type === "new_words") {
    candidates = getNewWords(db, userId, Math.min(DEFAULT_NEW_WORD_LIMIT, MAX_SESSION_SIZE)).map((i) => ({
      userVocabularyId: i.userVocabularyId,
      wordId: i.wordId,
      status: i.status,
      correctCount: i.correctCount,
      incorrectCount: i.incorrectCount,
    }));
  } else {
    candidates = getDueReviews(db, userId, Math.min(DEFAULT_DAILY_REVIEW_LIMIT, MAX_SESSION_SIZE)).map((i) => ({
      userVocabularyId: i.userVocabularyId,
      wordId: i.wordId,
      status: i.status,
      correctCount: i.correctCount,
      incorrectCount: i.incorrectCount,
    }));
  }

  return buildPlanFromCandidates(db, candidates);
}

export function startSession(db: Db, userId: string, input: StartSessionInput): StartSessionResult {
  const plan = buildSessionPlan(db, userId, input.type, input.wordId);
  if (plan.length === 0) {
    throw new Error("Not enough vocabulary data available to start this session yet.");
  }

  const sessionId = newId("lsession");
  db.insert(learningSessions)
    .values({
      id: sessionId,
      userId,
      type: input.type,
      status: "in_progress",
      itemsJson: JSON.stringify(plan),
      currentIndex: 0,
      newWordsCount: input.type === "new_words" ? plan.length : 0,
      reviewWordsCount: input.type === "daily_review" ? plan.length : 0,
    })
    .run();

  const first = plan[0];
  const question = buildQuestion(db, first.userVocabularyId, first.wordId, first.testType, sessionId);
  if (!question) throw new Error("Could not build the first question for this session.");

  return { sessionId, type: input.type, progress: { totalItems: plan.length, currentIndex: 0 }, question };
}

export interface SessionInfo {
  sessionId: string;
  type: SessionType;
  status: SessionRow["status"];
  totalItems: number;
  currentIndex: number;
  correctCount: number;
  incorrectCount: number;
  startedAt: string;
}

export function getSessionInfo(db: Db, userId: string, sessionId: string): SessionInfo {
  const session = getOwnedSession(db, userId, sessionId);
  const plan = parseItems(session.itemsJson);
  return {
    sessionId: session.id,
    type: session.type,
    status: session.status,
    totalItems: plan.length,
    currentIndex: session.currentIndex,
    correctCount: session.correctCount,
    incorrectCount: session.incorrectCount,
    startedAt: session.startedAt,
  };
}

// Safe to call repeatedly without side effects - resuming a session (e.g.
// after a page reload) just re-fetches the same current item, since only
// /answer and /outcome ever advance currentIndex.
export function getCurrentQuestion(db: Db, userId: string, sessionId: string): SessionQuestion | null {
  const session = getOwnedSession(db, userId, sessionId);
  if (session.status !== "in_progress") return null;
  const plan = parseItems(session.itemsJson);
  if (session.currentIndex >= plan.length) return null;
  const item = plan[session.currentIndex];
  return buildQuestion(db, item.userVocabularyId, item.wordId, item.testType, session.id);
}

function toRecordedUpdate(result: ReturnType<typeof recordReview>): RecordedMasteryUpdate {
  return {
    previousStatus: result.previousStatus,
    newStatus: result.newStatus,
    previousMasteryScore: result.previousMasteryScore,
    newMasteryScore: result.newMasteryScore,
    needsReview: result.needsReview,
    nextReviewAt: result.nextReviewAt,
  };
}

interface FinalizeResult {
  masteryUpdate: RecordedMasteryUpdate;
  sessionComplete: boolean;
  nextQuestion: SessionQuestion | null;
  progress: SessionProgress;
}

// The only place a session item is ever recorded and advanced - reuses
// Phase 5's recordReview for all mastery/SRS/history work (never
// duplicated here), then moves currentIndex forward and, if that was the
// last item, marks the session completed.
function finalizeCurrentItem(
  db: Db,
  userId: string,
  session: SessionRow,
  plan: SessionPlanItem[],
  item: SessionPlanItem,
  outcome: ReviewOutcome,
  responseTimeMs: number | undefined,
  wasCorrect: boolean
): FinalizeResult {
  const result = recordReview(db, userId, {
    userVocabularyId: item.userVocabularyId,
    testType: item.testType,
    outcome,
    responseTimeMs,
    learningSessionId: session.id,
  });

  const nextIndex = session.currentIndex + 1;
  const isComplete = nextIndex >= plan.length;
  const now = new Date();
  const durationSeconds = isComplete ? Math.round((now.getTime() - parseDbDate(session.startedAt).getTime()) / 1000) : null;

  db.update(learningSessions)
    .set({
      currentIndex: nextIndex,
      pendingCorrect: null,
      correctCount: session.correctCount + (wasCorrect ? 1 : 0),
      incorrectCount: session.incorrectCount + (wasCorrect ? 0 : 1),
      status: isComplete ? "completed" : "in_progress",
      completedAt: isComplete ? now.toISOString() : null,
      durationSeconds,
    })
    .where(eq(learningSessions.id, session.id))
    .run();

  let nextQuestion: SessionQuestion | null = null;
  if (!isComplete) {
    const nextItem = plan[nextIndex];
    nextQuestion = buildQuestion(db, nextItem.userVocabularyId, nextItem.wordId, nextItem.testType, session.id);
  }

  return {
    masteryUpdate: toRecordedUpdate(result),
    sessionComplete: isComplete,
    nextQuestion,
    progress: { totalItems: plan.length, currentIndex: nextIndex },
  };
}

const WORD_PRODUCING_TYPES = new Set(["meaning_to_english", "fill_blank", "spelling"]);

// Grades objectively, then either finalizes immediately (a wrong answer
// is unambiguously AGAIN - no further user input needed) or leaves the
// item pending a Hard/Good/Easy choice (see submitOutcome). The client
// only ever sends what it typed/selected and an optional response time -
// correctness, mastery, status, and scheduling are always computed here.
export function submitAnswer(db: Db, userId: string, sessionId: string, input: SubmitAnswerInput): SubmitAnswerResult {
  const session = getOwnedSession(db, userId, sessionId);
  if (session.status !== "in_progress") throw new Error("This session has already ended.");
  if (session.pendingCorrect) throw new Error("The current question is already awaiting a difficulty choice.");

  const plan = parseItems(session.itemsJson);
  if (session.currentIndex >= plan.length) throw new Error("This session has no more questions.");
  const item = plan[session.currentIndex];

  const ctx = getGradingContext(db, item.wordId);
  if (!ctx) throw new Error("Could not grade this question - word data is missing.");
  const sense = getPrimarySense(db, item.wordId);

  const isCorrect = gradeAnswer({
    testType: item.testType,
    submittedText: input.submittedText,
    correctWord: ctx.normalizedWord,
    correctDefinition: ctx.correctDefinition,
    blankedToken: ctx.blankedToken ?? undefined,
  });

  const correctAnswer = WORD_PRODUCING_TYPES.has(item.testType) ? ctx.word : ctx.correctDefinition;

  if (!isCorrect) {
    const finalized = finalizeCurrentItem(db, userId, session, plan, item, "again", input.responseTimeMs, false);
    return {
      isCorrect: false,
      correctAnswer,
      explanation: ctx.correctDefinition,
      exampleSentence: sense?.exampleSentence ?? null,
      requiresOutcomeChoice: false,
      masteryUpdate: finalized.masteryUpdate,
      sessionComplete: finalized.sessionComplete,
      nextQuestion: finalized.nextQuestion,
      progress: finalized.progress,
    };
  }

  db.update(learningSessions).set({ pendingCorrect: true }).where(eq(learningSessions.id, sessionId)).run();

  return {
    isCorrect: true,
    correctAnswer,
    explanation: ctx.correctDefinition,
    exampleSentence: sense?.exampleSentence ?? null,
    requiresOutcomeChoice: true,
    masteryUpdate: null,
    sessionComplete: false,
    nextQuestion: null,
    progress: { totalItems: plan.length, currentIndex: session.currentIndex },
  };
}

// Only valid immediately after a correct answer - the user cannot
// override correctness itself, only how easily a genuinely correct
// answer came, which the Phase 5 engine maps to mastery/SRS evidence.
export function submitOutcome(db: Db, userId: string, sessionId: string, input: SubmitOutcomeInput): SubmitOutcomeResult {
  const session = getOwnedSession(db, userId, sessionId);
  if (session.status !== "in_progress") throw new Error("This session has already ended.");
  if (!session.pendingCorrect) throw new Error("There is no correct answer awaiting a difficulty choice.");

  const plan = parseItems(session.itemsJson);
  const item = plan[session.currentIndex];

  const finalized = finalizeCurrentItem(db, userId, session, plan, item, input.outcome, undefined, true);
  return {
    masteryUpdate: finalized.masteryUpdate,
    sessionComplete: finalized.sessionComplete,
    nextQuestion: finalized.nextQuestion,
    progress: finalized.progress,
  };
}

function computeSummary(db: Db, session: SessionRow, plan: SessionPlanItem[]): SessionSummary {
  const rows = db
    .select({
      userVocabularyId: vocabularyReviewHistory.userVocabularyId,
      testType: vocabularyReviewHistory.testType,
      successful: vocabularyReviewHistory.successful,
      previousScore: vocabularyReviewHistory.previousScore,
      newScore: vocabularyReviewHistory.newScore,
      nextReviewAt: vocabularyReviewHistory.nextReviewAt,
      word: words.word,
      currentStatus: userVocabulary.status,
      needsReview: userVocabulary.needsReview,
      knownBeforeApp: userVocabulary.knownBeforeApp,
    })
    .from(vocabularyReviewHistory)
    .innerJoin(userVocabulary, eq(userVocabulary.id, vocabularyReviewHistory.userVocabularyId))
    .innerJoin(words, eq(words.id, userVocabulary.wordId))
    .where(eq(vocabularyReviewHistory.learningSessionId, session.id))
    .orderBy(asc(vocabularyReviewHistory.reviewedAt))
    .all();

  const itemResults: SessionItemResult[] = rows.map((r) => ({
    userVocabularyId: r.userVocabularyId,
    word: r.word,
    testType: r.testType as SessionItemResult["testType"],
    correct: r.successful,
    previousScore: r.previousScore,
    newScore: r.newScore,
    nextReviewAt: r.nextReviewAt,
  }));

  const correctCount = rows.filter((r) => r.successful).length;
  const incorrectCount = rows.length - correctCount;
  const successRate = rows.length > 0 ? Math.round((correctCount / rows.length) * 100) : 0;
  const wordsImproved = rows.filter((r) => r.newScore > r.previousScore).length;

  const distinctByWord = new Map<string, (typeof rows)[number]>();
  for (const r of rows) distinctByWord.set(r.userVocabularyId, r);
  const distinctRows = [...distinctByWord.values()];

  const wordsMastered = distinctRows.filter((r) => r.currentStatus === "mastered").length;
  const wordsNeedingReview = distinctRows.filter((r) => r.needsReview).length;
  const knownBeforeAppTouched = distinctRows.filter((r) => r.knownBeforeApp).length;
  const learnedThroughAppTouched = distinctRows.filter((r) => !r.knownBeforeApp).length;

  return {
    sessionId: session.id,
    type: session.type,
    status: session.status === "exited" ? "exited" : "completed",
    totalItems: plan.length,
    completedItems: rows.length,
    correctCount,
    incorrectCount,
    successRate,
    wordsImproved,
    wordsMastered,
    wordsNeedingReview,
    knownBeforeAppTouched,
    learnedThroughAppTouched,
    durationSeconds: session.durationSeconds ?? 0,
    itemResults,
  };
}

// Idempotent: safe to call again after the session already auto-completed
// on the final answer/outcome - just recomputes and returns the same
// summary from history rather than mutating anything further.
export function completeSession(db: Db, userId: string, sessionId: string): SessionSummary {
  const session = getOwnedSession(db, userId, sessionId);
  const plan = parseItems(session.itemsJson);

  if (session.status === "in_progress" && session.currentIndex < plan.length) {
    throw new Error("This session still has unanswered questions - use exit to stop early instead.");
  }

  return computeSummary(db, session, plan);
}

// Stops a session early. Everything already answered was already recorded
// by submitAnswer/submitOutcome (recordReview persists at answer time,
// not at session-end) - exiting never undoes completed reviews, and
// never pretends the remaining, unanswered items were completed.
export function exitSession(db: Db, userId: string, sessionId: string): SessionSummary {
  let session = getOwnedSession(db, userId, sessionId);
  const plan = parseItems(session.itemsJson);

  if (session.status === "in_progress") {
    const now = new Date();
    const durationSeconds = Math.round((now.getTime() - parseDbDate(session.startedAt).getTime()) / 1000);
    db.update(learningSessions)
      .set({ status: "exited", completedAt: now.toISOString(), durationSeconds, pendingCorrect: null })
      .where(eq(learningSessions.id, sessionId))
      .run();
    session = getOwnedSession(db, userId, sessionId);
  }

  return computeSummary(db, session, plan);
}

// "Review difficult words" - a small NEW session built only from the
// words the user got wrong in a prior session, never a repeat of the
// whole thing. Word selection here is explicit (not re-run through the
// priority queue), since these are specific, already-known trouble words.
export function startDifficultWordsSession(db: Db, userId: string, sourceSessionId: string): StartSessionResult {
  const source = getOwnedSession(db, userId, sourceSessionId);
  const sourcePlan = parseItems(source.itemsJson);
  const summary = computeSummary(db, source, sourcePlan);

  const difficultUvIds = [...new Set(summary.itemResults.filter((r) => !r.correct).map((r) => r.userVocabularyId))];
  if (difficultUvIds.length === 0) {
    throw new Error("No difficult words from that session to review.");
  }

  const candidates: Candidate[] = difficultUvIds
    .map((id) => db.select().from(userVocabulary).where(eq(userVocabulary.id, id)).get())
    .filter((uv): uv is NonNullable<typeof uv> => Boolean(uv))
    .map((uv) => ({
      userVocabularyId: uv.id,
      wordId: uv.wordId,
      status: uv.status,
      correctCount: uv.correctCount,
      incorrectCount: uv.incorrectCount,
    }));

  const plan = buildPlanFromCandidates(db, candidates);
  if (plan.length === 0) throw new Error("Could not build a review session for these words.");

  const sessionId = newId("lsession");
  db.insert(learningSessions)
    .values({
      id: sessionId,
      userId,
      type: "daily_review",
      status: "in_progress",
      itemsJson: JSON.stringify(plan),
      currentIndex: 0,
      reviewWordsCount: plan.length,
    })
    .run();

  const first = plan[0];
  const question = buildQuestion(db, first.userVocabularyId, first.wordId, first.testType, sessionId);
  if (!question) throw new Error("Could not build the first question for this session.");

  return { sessionId, type: "daily_review", progress: { totalItems: plan.length, currentIndex: 0 }, question };
}
