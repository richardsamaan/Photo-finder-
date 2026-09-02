import type { VocabularyStatus } from "../mastery/types.js";

// Phase 6 implements these five first; the other five Phase-5 test types
// (sentence_completion, context_recognition, listening, active_usage,
// ai_conversation) plug into the same architecture later without a
// session-engine redesign - see questionBuilder.ts.
export type SessionTestType = "multiple_choice" | "english_to_meaning" | "meaning_to_english" | "fill_blank" | "spelling";

export type SessionType = "daily_review" | "new_words" | "focused_word";
export type SessionStatus = "in_progress" | "completed" | "exited";

// The session's stored plan - deliberately minimal (see schema.ts's
// comment on learning_sessions.items_json): question content is always
// rebuilt fresh from live dictionary data, never cached here.
export interface SessionPlanItem {
  userVocabularyId: string;
  wordId: string;
  testType: SessionTestType;
}

export interface SessionQuestionOption {
  key: "A" | "B" | "C" | "D";
  text: string;
}

// Never carries the correct answer or any isCorrect-shaped field. `word` is
// only ever populated for multiple_choice/english_to_meaning, where the word
// is already given and the definition is what's being tested - for
// meaning_to_english, spelling, and fill_blank the word IS the answer, so it
// is omitted entirely rather than merely hidden by the UI (the JSON payload
// itself must not contain it before the user answers).
export interface SessionQuestion {
  userVocabularyId: string;
  wordId: string;
  word?: string;
  testType: SessionTestType;
  prompt: string;
  options?: SessionQuestionOption[]; // multiple_choice only
  sentence?: string; // fill_blank only - the example sentence with a blank
  phonetic?: string | null;
}

export interface SessionProgress {
  totalItems: number;
  currentIndex: number; // 0-based index of the item about to be answered
}

export interface StartSessionInput {
  type: SessionType;
  wordId?: string; // required for "focused_word"
}

export interface StartSessionResult {
  sessionId: string;
  type: SessionType;
  progress: SessionProgress;
  question: SessionQuestion;
}

export interface SubmitAnswerInput {
  submittedText: string | null; // null = the user skipped/didn't know
  responseTimeMs?: number;
}

export interface SubmitAnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
  exampleSentence: string | null;
  requiresOutcomeChoice: boolean; // true only when isCorrect - user must pick Hard/Good/Easy
  // Present only when the review was already recorded (always true when
  // !isCorrect, since AGAIN needs no further user input).
  masteryUpdate: RecordedMasteryUpdate | null;
  sessionComplete: boolean;
  nextQuestion: SessionQuestion | null;
  progress: SessionProgress;
}

export interface SubmitOutcomeInput {
  outcome: "hard" | "good" | "easy";
}

export interface SubmitOutcomeResult {
  masteryUpdate: RecordedMasteryUpdate;
  sessionComplete: boolean;
  nextQuestion: SessionQuestion | null;
  progress: SessionProgress;
}

export interface RecordedMasteryUpdate {
  previousStatus: VocabularyStatus;
  newStatus: VocabularyStatus;
  previousMasteryScore: number;
  newMasteryScore: number;
  needsReview: boolean;
  nextReviewAt: string;
}

export interface SessionItemResult {
  userVocabularyId: string;
  word: string;
  testType: SessionTestType;
  correct: boolean;
  previousScore: number;
  newScore: number;
  nextReviewAt: string | null;
}

export interface SessionSummary {
  sessionId: string;
  type: SessionType;
  status: SessionStatus;
  totalItems: number;
  completedItems: number;
  correctCount: number;
  incorrectCount: number;
  successRate: number;
  wordsImproved: number;
  wordsMastered: number;
  wordsNeedingReview: number;
  knownBeforeAppTouched: number;
  learnedThroughAppTouched: number;
  durationSeconds: number;
  itemResults: SessionItemResult[];
}
