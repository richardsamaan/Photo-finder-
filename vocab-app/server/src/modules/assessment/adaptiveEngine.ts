import type { Tier } from "./types.js";

// Pure, dependency-free tier-movement logic - kept isolated so the
// adaptive strategy can be replaced with something more sophisticated
// later (e.g. IRT-style ability estimation) without touching the
// question bank, scoring, or the service that wires them together.
export const TIERS: Tier[] = ["beginner", "intermediate", "advanced"];
export const STARTING_TIER: Tier = "intermediate";
export const MAX_QUESTIONS = 20;

export function nextTier(currentTier: Tier, wasCorrect: boolean): Tier {
  const idx = TIERS.indexOf(currentTier);
  if (wasCorrect) return TIERS[Math.min(idx + 1, TIERS.length - 1)];
  return TIERS[Math.max(idx - 1, 0)];
}

export function shouldContinue(answeredCount: number, maxQuestions: number = MAX_QUESTIONS): boolean {
  return answeredCount < maxQuestions;
}
