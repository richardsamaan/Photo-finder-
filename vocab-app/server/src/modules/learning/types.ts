import type { TestType, ReviewOutcome, VocabularyStatus } from "../mastery/types.js";

export type { TestType, ReviewOutcome, VocabularyStatus };

export interface RecordReviewInput {
  userVocabularyId: string;
  testType: TestType;
  outcome: ReviewOutcome;
  responseTimeMs?: number;
  // Present when this review happens inside a Phase 6 learning session -
  // lets a session summary be reconstructed straight from history rows.
  // Absent for standalone reviews (e.g. the Phase 5 Learning Queue screen).
  learningSessionId?: string;
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
  correctCount: number;
  incorrectCount: number;
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
