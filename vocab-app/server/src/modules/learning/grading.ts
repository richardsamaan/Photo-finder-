import { MEANING_RECALL_MIN_OVERLAP_RATIO } from "./sessionConfig.js";
import type { SessionTestType } from "./sessionTypes.js";

export function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase();
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "and",
  "or",
  "is",
  "are",
  "be",
  "that",
  "this",
  "it",
  "as",
  "with",
  "by",
  "from",
  "someone",
  "something",
]);

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// No AI is available, so "did the user recall the meaning" is graded by
// keyword overlap against the real definition rather than true semantic
// understanding. Deliberately lenient (documented, not claimed as NLU):
// requires at least one shared content word AND a minimum fraction of the
// definition's significant words to appear, so a single generic word
// ("thing", "good") can't trivially pass on its own.
export function gradeMeaningRecall(submitted: string, correctDefinition: string): boolean {
  const answerWords = new Set(significantWords(submitted));
  if (answerWords.size === 0) return false;

  const defWords = significantWords(correctDefinition);
  if (defWords.length === 0) return false;

  const overlap = defWords.filter((w) => answerWords.has(w)).length;
  return overlap >= 1 && overlap / defWords.length >= MEANING_RECALL_MIN_OVERLAP_RATIO;
}

export interface GradeInput {
  testType: SessionTestType;
  submittedText: string | null;
  correctWord: string; // the word's normalized_word
  correctDefinition: string; // the primary sense's definition, verbatim
  blankedToken?: string; // fill_blank only - the exact token blanked out of the example sentence
}

// The single place correctness is decided - always server-side, always
// from live dictionary data, never trusting anything the client asserts
// about its own answer.
export function gradeAnswer(input: GradeInput): boolean {
  if (input.submittedText === null) return false;
  const submitted = input.submittedText.trim();
  if (!submitted) return false;

  switch (input.testType) {
    case "multiple_choice":
      // Options are sent as full definition text (see questionBuilder.ts) -
      // matches the same "compare submitted text to the real definition"
      // pattern the Phase 3 assessment already uses, so nothing about
      // which option is correct is ever encoded in the question payload.
      return submitted === input.correctDefinition;
    case "meaning_to_english":
    case "spelling":
      return normalizeAnswer(submitted) === normalizeAnswer(input.correctWord);
    case "fill_blank":
      return normalizeAnswer(submitted) === normalizeAnswer(input.blankedToken ?? input.correctWord);
    case "english_to_meaning":
      return gradeMeaningRecall(submitted, input.correctDefinition);
    default:
      return false;
  }
}
