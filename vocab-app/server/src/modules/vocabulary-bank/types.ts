export type VocabularyStatus = "new" | "learning" | "familiar" | "mastered";
export type DifficultyLevel = "beginner" | "intermediate" | "advanced";
export type KnownFilter = "known_before_app" | "learned_through_app";
export type SortKey = "recent" | "reviewed" | "nextReview" | "mastery" | "alphabetical" | "difficult" | "forgotten";

export interface VocabularyListParams {
  search?: string;
  status?: VocabularyStatus;
  needsReview?: boolean;
  known?: KnownFilter;
  difficulty?: DifficultyLevel;
  collectionId?: string;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface VocabularyListItem {
  userVocabularyId: string;
  wordId: string;
  word: string;
  difficultyLevel: DifficultyLevel | null;
  pronunciation: string | null;
  phonetic: string | null;
  partOfSpeech: string | null;
  definition: string | null;
  status: VocabularyStatus;
  needsReview: boolean;
  masteryScore: number;
  knownBeforeApp: boolean;
  firstEncounteredAt: string;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
}

export interface VocabularyListResult {
  items: VocabularyListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VocabularySummary {
  total: number;
  new: number;
  learning: number;
  familiar: number;
  mastered: number;
  needsReview: number;
  knownBeforeApp: number;
  learnedThroughApp: number;
}

export interface WordSenseDetail {
  definition: string;
  translation: string | null;
  partOfSpeech: string;
  exampleSentence: string | null;
  pronunciation: string | null;
  phonetic: string | null;
  audioUrl: string | null;
}

export interface WordDetail {
  userVocabularyId: string;
  wordId: string;
  word: string;
  difficultyLevel: DifficultyLevel | null;
  frequencyRank: number | null;
  status: VocabularyStatus;
  needsReview: boolean;
  masteryScore: number;
  confidenceScore: number;
  knownBeforeApp: boolean;
  firstEncounteredAt: string;
  learnedAt: string | null;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  reviewCount: number;
  correctCount: number;
  incorrectCount: number;
  senses: WordSenseDetail[];
  synonyms: string[];
  antonyms: string[];
  related: string[];
  collections: { id: string; name: string }[];
}
