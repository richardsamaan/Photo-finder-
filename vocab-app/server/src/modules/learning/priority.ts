import type { VocabularyStatus } from "../mastery/types.js";

// Pure priority scoring for the review queue - deliberately more than a
// next_review_at sort. Needs-review words always sort first; beyond that,
// overdue amount, weak (decayed) retention, "learning" status, and a
// history of mistakes all push a word up the queue.
export interface QueuePriorityInput {
  needsReview: boolean;
  overdueDays: number;
  effectiveMasteryScore: number;
  status: VocabularyStatus;
  incorrectCount: number;
}

const NEEDS_REVIEW_BONUS = 1000;
const OVERDUE_DAY_WEIGHT = 10;
const RETENTION_GAP_WEIGHT = 2;
const LEARNING_STATUS_BONUS = 50;
const INCORRECT_COUNT_WEIGHT = 5;
const INCORRECT_COUNT_CAP = 10;

export function computeQueuePriority(input: QueuePriorityInput): number {
  let score = 0;
  if (input.needsReview) score += NEEDS_REVIEW_BONUS;
  score += input.overdueDays * OVERDUE_DAY_WEIGHT;
  score += (100 - input.effectiveMasteryScore) * RETENTION_GAP_WEIGHT;
  if (input.status === "learning") score += LEARNING_STATUS_BONUS;
  score += Math.min(input.incorrectCount, INCORRECT_COUNT_CAP) * INCORRECT_COUNT_WEIGHT;
  return Math.round(score);
}
