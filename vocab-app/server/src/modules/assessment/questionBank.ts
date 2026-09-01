import type { AssessmentQuestion, AssessmentQuestionOption, Tier } from "./types.js";

export interface WordWithSense {
  id: string;
  word: string;
  difficultyLevel: string | null;
  definition: string;
  partOfSpeech: string;
}

const KEYS: AssessmentQuestionOption["key"][] = ["A", "B", "C", "D"];

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Builds a 4-option multiple-choice question from real seeded word data -
// one correct definition plus 3 distractors drawn from other words, all
// shuffled into a random position. Never hard-codes question content.
export function buildQuestion(target: WordWithSense, pool: WordWithSense[]): AssessmentQuestion {
  const distractorCandidates = pool.filter((w) => w.id !== target.id && w.definition !== target.definition);
  const distractors = shuffle(distractorCandidates).slice(0, 3);

  const optionTexts = shuffle([target.definition, ...distractors.map((d) => d.definition)]);
  const options: AssessmentQuestionOption[] = optionTexts.map((text, i) => ({ key: KEYS[i], text }));

  return {
    wordId: target.id,
    word: target.word,
    difficultyLevel: (target.difficultyLevel ?? "intermediate") as Tier,
    prompt: `What does "${target.word}" mean?`,
    options,
  };
}
