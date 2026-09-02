import { and, eq, sql } from "drizzle-orm";
import type { db as RealDb } from "../../db/client.js";
import { userVocabulary, words, vocabularyReviewHistory } from "../../db/schema.js";
import { getSummary } from "../vocabulary-bank/service.js";
import { computeEffectiveMastery } from "../mastery/engine.js";
import { MASTERY_THRESHOLDS } from "../mastery/config.js";
import { isDue, overdueDays } from "../spaced-repetition/srsEngine.js";
import { computeQueuePriority } from "./priority.js";
import type { LearningStats, QueueItem } from "./types.js";

type Db = typeof RealDb;

// How many candidate rows we're willing to pull from SQL before doing
// live decay/priority computation in JS. This bounds the work to a
// generous-but-finite set (needs-review + due + all mastered words -
// mastered words need a live decay check since their long intervals mean
// SQL alone can't tell "quietly forgotten" from "still fine") rather than
// the user's entire vocabulary bank, which could be tens of thousands of
// untouched "new" rows that have no business being queue candidates yet.
const CANDIDATE_LIMIT = 500;

function buildQueueItems(
  rows: {
    userVocabularyId: string;
    wordId: string;
    word: string;
    status: QueueItem["status"];
    needsReview: boolean;
    masteryScore: number;
    nextReviewAt: string | null;
    lastReviewedAt: string | null;
    firstEncounteredAt: string;
    incorrectCount: number;
    correctCount: number;
  }[],
  now: Date
): QueueItem[] {
  return rows
    .map((r) => {
      const effectiveMasteryScore = computeEffectiveMastery(
        { baseScore: r.masteryScore, lastReviewedAt: r.lastReviewedAt, firstEncounteredAt: r.firstEncounteredAt },
        now
      );
      const overdue = overdueDays(r.nextReviewAt, now);
      const due = isDue(r.nextReviewAt, now);
      // A "mastered" word whose decayed (effective) mastery has fallen
      // enough to no longer count as familiar is forgotten enough to
      // deserve review again, even though its next_review_at is still far
      // in the future and needs_review was never explicitly set.
      const decayedBackToReview = r.status === "mastered" && effectiveMasteryScore < MASTERY_THRESHOLDS.familiar;
      const isQueueDue = due || r.needsReview || decayedBackToReview;

      let reason: QueueItem["reason"];
      if (r.needsReview) reason = "needs_review";
      else if (decayedBackToReview) reason = "mastered_decayed";
      else if (overdue > 0) reason = "overdue";
      else if (!r.nextReviewAt) reason = "new";
      else reason = "due";

      const priority = computeQueuePriority({
        needsReview: r.needsReview,
        overdueDays: overdue,
        effectiveMasteryScore,
        status: r.status,
        incorrectCount: r.incorrectCount,
      });

      return {
        item: {
          userVocabularyId: r.userVocabularyId,
          wordId: r.wordId,
          word: r.word,
          status: r.status,
          needsReview: r.needsReview,
          baseMasteryScore: r.masteryScore,
          effectiveMasteryScore,
          nextReviewAt: r.nextReviewAt,
          overdueDays: overdue,
          priority,
          reason,
          correctCount: r.correctCount,
          incorrectCount: r.incorrectCount,
        } satisfies QueueItem,
        isQueueDue,
      };
    })
    .filter((x) => x.isQueueDue)
    .map((x) => x.item)
    .sort((a, b) => b.priority - a.priority);
}

export function getLearningQueue(db: Db, userId: string, limit = 50): QueueItem[] {
  const nowIso = new Date().toISOString();

  const rows = db
    .select({
      userVocabularyId: userVocabulary.id,
      wordId: words.id,
      word: words.word,
      status: userVocabulary.status,
      needsReview: userVocabulary.needsReview,
      masteryScore: userVocabulary.masteryScore,
      nextReviewAt: userVocabulary.nextReviewAt,
      lastReviewedAt: userVocabulary.lastReviewedAt,
      firstEncounteredAt: userVocabulary.firstEncounteredAt,
      incorrectCount: userVocabulary.incorrectCount,
      correctCount: userVocabulary.correctCount,
    })
    .from(userVocabulary)
    .innerJoin(words, eq(words.id, userVocabulary.wordId))
    .where(
      and(
        eq(userVocabulary.userId, userId),
        eq(userVocabulary.archived, false),
        sql`(
          ${userVocabulary.nextReviewAt} IS NULL
          OR ${userVocabulary.nextReviewAt} <= ${nowIso}
          OR ${userVocabulary.needsReview} = 1
          OR ${userVocabulary.status} = 'mastered'
        )`
      )
    )
    .limit(CANDIDATE_LIMIT)
    .all();

  return buildQueueItems(rows, new Date()).slice(0, limit);
}

// A narrower view of the queue: genuine reviews due now, excluding
// brand-new never-studied words (those belong to a "learn new words"
// flow, not a "review" flow).
export function getDueReviews(db: Db, userId: string, limit = 50): QueueItem[] {
  return getLearningQueue(db, userId, CANDIDATE_LIMIT).filter((item) => item.reason !== "new").slice(0, limit);
}

// A narrower view of the queue: brand-new, never-studied words - the
// "learn new words" flow's candidate pool. Reuses the same queue
// candidates and priority computation rather than a second, independent
// selection algorithm.
export function getNewWords(db: Db, userId: string, limit = 50): QueueItem[] {
  return getLearningQueue(db, userId, CANDIDATE_LIMIT).filter((item) => item.reason === "new").slice(0, limit);
}

function startOfDayIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function endOfDayIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();
}

export function getLearningStats(db: Db, userId: string): LearningStats {
  const summary = getSummary(db, userId);
  const now = new Date();
  const startToday = startOfDayIso(now);
  const endToday = endOfDayIso(now);

  const dueTodayRow = db
    .select({ count: sql<number>`count(*)` })
    .from(userVocabulary)
    .where(
      and(
        eq(userVocabulary.userId, userId),
        sql`${userVocabulary.nextReviewAt} IS NOT NULL AND ${userVocabulary.nextReviewAt} <= ${endToday}`
      )
    )
    .get();

  const overdueRow = db
    .select({ count: sql<number>`count(*)` })
    .from(userVocabulary)
    .where(
      and(
        eq(userVocabulary.userId, userId),
        sql`${userVocabulary.nextReviewAt} IS NOT NULL AND ${userVocabulary.nextReviewAt} < ${startToday}`
      )
    )
    .get();

  const activeLearningRow = db
    .select({ count: sql<number>`count(*)` })
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, userId), sql`${userVocabulary.status} IN ('learning', 'familiar')`))
    .get();

  const avgRow = db
    .select({ avg: sql<number | null>`avg(${userVocabulary.masteryScore})` })
    .from(userVocabulary)
    .where(eq(userVocabulary.userId, userId))
    .get();

  const retentionRow = db
    .select({
      total: sql<number>`count(*)`,
      successful: sql<number>`sum(case when ${vocabularyReviewHistory.successful} = 1 then 1 else 0 end)`,
    })
    .from(vocabularyReviewHistory)
    .innerJoin(userVocabulary, eq(userVocabulary.id, vocabularyReviewHistory.userVocabularyId))
    .where(eq(userVocabulary.userId, userId))
    .get();

  const retentionRate =
    retentionRow && retentionRow.total > 0 ? Math.round(((retentionRow.successful ?? 0) / retentionRow.total) * 100) : 0;

  return {
    ...summary,
    dueToday: dueTodayRow?.count ?? 0,
    overdue: overdueRow?.count ?? 0,
    activeLearning: activeLearningRow?.count ?? 0,
    averageMastery: avgRow?.avg ? Math.round(avgRow.avg) : 0,
    retentionRate,
  };
}
