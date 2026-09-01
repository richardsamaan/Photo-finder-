import type { Tier } from "./types.js";

interface ResponseLike {
  difficultyLevel: string;
  isCorrect: boolean;
  dontKnow: boolean;
}

export interface AssessmentResultPayload {
  totalQuestions: number;
  knownWordCount: number;
  learningWordCount: number;
  estimatedVocabularySize: number;
  estimatedLevel: string;
  confidence: "low" | "medium" | "high";
}

// Illustrative platform constants, NOT a scientific vocabulary-size model.
// Each value is the marginal vocabulary a learner is assumed to hold once
// they've fully mastered that difficulty band (e.g. mastering "advanced"
// on top of beginner+intermediate implies roughly 10,000 words known).
// This turns real assessment answers into a clearly-labeled ballpark - it
// is deliberately simple so it can be replaced with a better-calibrated
// model later without touching anything that calls it.
const TIER_INCREMENT: Record<Tier, number> = {
  beginner: 1000,
  intermediate: 3000,
  advanced: 6000,
};
const TIER_ORDER: Tier[] = ["beginner", "intermediate", "advanced"];

export function computeResult(responses: ResponseLike[]): AssessmentResultPayload {
  const totalQuestions = responses.length;
  const knownWordCount = responses.filter((r) => r.isCorrect && !r.dontKnow).length;
  const learningWordCount = totalQuestions - knownWordCount;

  const byTier: Record<Tier, { asked: number; correct: number }> = {
    beginner: { asked: 0, correct: 0 },
    intermediate: { asked: 0, correct: 0 },
    advanced: { asked: 0, correct: 0 },
  };
  for (const r of responses) {
    const tier = r.difficultyLevel as Tier;
    if (!byTier[tier]) continue;
    byTier[tier].asked += 1;
    if (r.isCorrect && !r.dontKnow) byTier[tier].correct += 1;
  }

  const highestTestedIdx = TIER_ORDER.reduce((acc, tier, idx) => (byTier[tier].asked > 0 ? idx : acc), -1);

  let estimatedVocabularySize = 0;
  TIER_ORDER.forEach((tier, idx) => {
    let accuracy: number;
    if (byTier[tier].asked > 0) {
      accuracy = byTier[tier].correct / byTier[tier].asked;
    } else if (idx < highestTestedIdx) {
      // Never tested because a harder tier was already answered well -
      // assume this easier tier is known.
      accuracy = 1;
    } else {
      // Never reached - no evidence either way, assume not yet known.
      accuracy = 0;
    }
    estimatedVocabularySize += TIER_INCREMENT[tier] * accuracy;
  });
  estimatedVocabularySize = Math.round(estimatedVocabularySize);

  const estimatedLevel = levelForSize(estimatedVocabularySize);

  const tiersCovered = TIER_ORDER.filter((t) => byTier[t].asked > 0).length;
  let confidence: AssessmentResultPayload["confidence"] = "low";
  if (totalQuestions >= 15 && tiersCovered === 3) confidence = "high";
  else if (totalQuestions >= 8) confidence = "medium";

  return { totalQuestions, knownWordCount, learningWordCount, estimatedVocabularySize, estimatedLevel, confidence };
}

// Illustrative CEFR-style mapping, not an authoritative certification.
function levelForSize(size: number): string {
  if (size < 1500) return "A1";
  if (size < 3000) return "A2";
  if (size < 5000) return "B1";
  if (size < 8000) return "B2";
  if (size < 12000) return "C1";
  return "C2";
}
