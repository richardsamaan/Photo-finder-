export type Tier = "beginner" | "intermediate" | "advanced";

export interface AssessmentQuestionOption {
  key: "A" | "B" | "C" | "D";
  text: string;
}

// Deliberately does NOT carry which option is correct - the server grades
// answers by comparing the submitted text against the word's own stored
// definition, so nothing about correctness ever needs to reach the client.
export interface AssessmentQuestion {
  wordId: string;
  word: string;
  difficultyLevel: Tier;
  prompt: string;
  options: AssessmentQuestionOption[];
}
