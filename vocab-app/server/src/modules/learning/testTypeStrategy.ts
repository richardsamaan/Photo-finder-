import { TEST_TYPE_ROTATION_CHALLENGING, TEST_TYPE_ROTATION_REINFORCING } from "./sessionConfig.js";
import type { SessionTestType } from "./sessionTypes.js";
import type { VocabularyStatus } from "../mastery/types.js";

export interface TestTypeSelectionInput {
  status: VocabularyStatus;
  correctCount: number;
  incorrectCount: number;
}

// Deterministic, not random - given the same inputs this always returns
// the same rotation, so sessions stay reproducible/testable per the
// product requirement. Adapts which rotation to draw from based on how
// the user has actually been doing on the word (difficulty adaptation of
// *test presentation*, never touching the Phase 5 mastery/SRS math).
export function pickRotation(input: TestTypeSelectionInput): SessionTestType[] {
  const struggling = input.status === "new" || input.incorrectCount > input.correctCount;
  return struggling ? TEST_TYPE_ROTATION_REINFORCING : TEST_TYPE_ROTATION_CHALLENGING;
}

// Picks a test type for the item at `index` within the session, rotating
// through the chosen rotation for variety, then falling forward through
// the rest of that rotation and finally the other rotation until an
// eligible type is found (e.g. fill_blank needs a locatable token in the
// example sentence; multiple_choice needs enough distractors). Returns
// null only if literally nothing is eligible (e.g. the word has no
// dictionary sense at all yet).
export function chooseTestType(
  input: TestTypeSelectionInput,
  index: number,
  isEligible: (testType: SessionTestType) => boolean
): SessionTestType | null {
  const primary = pickRotation(input);
  const secondary = primary === TEST_TYPE_ROTATION_REINFORCING ? TEST_TYPE_ROTATION_CHALLENGING : TEST_TYPE_ROTATION_REINFORCING;

  const ordered = [
    ...primary.slice(index % primary.length).concat(primary.slice(0, index % primary.length)),
    ...secondary,
  ];

  for (const candidate of ordered) {
    if (isEligible(candidate)) return candidate;
  }
  return null;
}
