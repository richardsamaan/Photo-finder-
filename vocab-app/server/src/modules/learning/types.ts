import type { TestType, ReviewOutcome, VocabularyStatus } from "../mastery/types.js";

export type { TestType, ReviewOutcome, VocabularyStatus };

export interface RecordReviewInput {
  userVocabularyId: string;
  testType: TestType;
  outcome: ReviewOutcome;
  responseTimeMs?: number;
}

export interface RecordReviewResult {
  userVocabularyId: string;
  previousStatus: VocabularyStatus;
  newStatus: VocabularyStatus;
  previousMasteryScore: number;
  newMasteryScore: number;
  effectiveMasteryScore: number;
  needsReview: boolean;
  previousIntervalDays: number;
  newIntervalDays: number;
  nextReviewAt: string;
  wasDue: boolean;
  successful: boolean;
}

export interface QueueItem {
  userVocabularyId: string;
  wordId: string;
  word: string;
  status: VocabularyStatus;
  needsReview: boolean;
  baseMasteryScore: number;
  effectiveMasteryScore: number;
  nextReviewAt: string | null;
  overdueDays: number;
  priority: number;
  reason: "needs_review" | "overdue" | "due" | "new" | "mastered_decayed";
}

export interface LearningStats {
  total: number;
  new: number;
  learning: number;
  familiar: number;
  mastered: number;
  needsReview: number;
  dueToday: number;
  overdue: number;
  activeLearning: number;
  learnedThroughApp: number;
  knownBeforeApp: number;
  averageMastery: number;
  retentionRate: number;
}
