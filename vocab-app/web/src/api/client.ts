const API_BASE = ""; // same-origin; Vite dev proxy forwards /api

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

function toQueryString(params: object): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value !== undefined && value !== "") usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export interface HealthResponse {
  ok: boolean;
  app: string;
  phase: number;
  aiProvider: string;
  aiConfigured: boolean;
}

export type Tier = "beginner" | "intermediate" | "advanced";

export interface AssessmentQuestionOption {
  key: "A" | "B" | "C" | "D";
  text: string;
}

export interface AssessmentQuestion {
  wordId: string;
  word: string;
  difficultyLevel: Tier;
  prompt: string;
  options: AssessmentQuestionOption[];
}

export interface AssessmentProgress {
  current: number;
  total: number;
}

export interface AssessmentResult {
  sessionId: string;
  totalQuestions: number;
  knownWordCount: number;
  learningWordCount: number;
  estimatedVocabularySize: number;
  estimatedLevel: string;
  confidence: "low" | "medium" | "high";
  isBaseline: boolean;
}

export interface StartAssessmentResponse {
  sessionId: string;
  question: AssessmentQuestion;
  progress: AssessmentProgress;
}

export interface SubmitAnswerResponse {
  nextQuestion: AssessmentQuestion | null;
  progress: AssessmentProgress | null;
  result: AssessmentResult | null;
}

export type VocabularyStatus = "new" | "learning" | "familiar" | "mastered";
export type KnownFilter = "known_before_app" | "learned_through_app";
export type SortKey = "recent" | "reviewed" | "nextReview" | "mastery" | "alphabetical" | "difficult" | "forgotten";

export interface VocabularyListParams {
  search?: string;
  status?: VocabularyStatus;
  needsReview?: boolean;
  known?: KnownFilter;
  difficulty?: Tier;
  collectionId?: string;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface VocabularyListItem {
  userVocabularyId: string;
  wordId: string;
  word: string;
  difficultyLevel: Tier | null;
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
  difficultyLevel: Tier | null;
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

export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  wordCount: number;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),

  startAssessment: () => request<StartAssessmentResponse>("/api/assessment", { method: "POST" }),

  submitAssessmentAnswer: (
    sessionId: string,
    body: { wordId: string; selectedOptionText: string | null; responseTimeMs?: number }
  ) =>
    request<SubmitAnswerResponse>(`/api/assessment/${sessionId}/answer`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listVocabulary: (params: VocabularyListParams) =>
    request<VocabularyListResult>(`/api/vocabulary${toQueryString(params)}`),

  getVocabularySummary: () => request<VocabularySummary>("/api/vocabulary/summary"),

  getWordDetail: (userVocabularyId: string) => request<WordDetail>(`/api/vocabulary/${userVocabularyId}`),

  addWord: (word: string) =>
    request<{ userVocabularyId: string; wordId: string; wordCreated: boolean }>("/api/vocabulary/words", {
      method: "POST",
      body: JSON.stringify({ word }),
    }),

  markDontKnow: (wordId: string) =>
    request<{ userVocabularyId: string }>("/api/vocabulary/dont-know", {
      method: "POST",
      body: JSON.stringify({ wordId }),
    }),

  listCollections: () => request<CollectionSummary[]>("/api/collections"),

  createCollection: (name: string, description?: string) =>
    request<{ id: string }>("/api/collections", { method: "POST", body: JSON.stringify({ name, description }) }),

  updateCollection: (collectionId: string, patch: { name?: string; description?: string }) =>
    request<{ ok: boolean }>(`/api/collections/${collectionId}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteCollection: (collectionId: string) =>
    request<{ ok: boolean }>(`/api/collections/${collectionId}`, { method: "DELETE" }),

  addWordToCollection: (collectionId: string, userVocabularyId: string) =>
    request<{ ok: boolean }>(`/api/collections/${collectionId}/words`, {
      method: "POST",
      body: JSON.stringify({ userVocabularyId }),
    }),

  removeWordFromCollection: (collectionId: string, userVocabularyId: string) =>
    request<{ ok: boolean }>(`/api/collections/${collectionId}/words/${userVocabularyId}`, { method: "DELETE" }),

  getLearningQueue: () => request<{ items: QueueItem[] }>("/api/learning/queue"),

  getLearningStats: () => request<LearningStats>("/api/learning/stats"),

  recordReview: (body: { userVocabularyId: string; testType: TestType; outcome: ReviewOutcome; responseTimeMs?: number }) =>
    request<RecordReviewResult>("/api/learning/review", { method: "POST", body: JSON.stringify(body) }),

  startLearningSession: (body: { type: SessionType; wordId?: string }) =>
    request<StartSessionResponse>("/api/learning/sessions", { method: "POST", body: JSON.stringify(body) }),

  getSessionInfo: (sessionId: string) => request<SessionInfo>(`/api/learning/sessions/${sessionId}`),

  getSessionCurrentQuestion: (sessionId: string) =>
    request<{ question: SessionQuestion }>(`/api/learning/sessions/${sessionId}/current`),

  submitSessionAnswer: (sessionId: string, body: { submittedText: string | null; responseTimeMs?: number }) =>
    request<SessionSubmitAnswerResponse>(`/api/learning/sessions/${sessionId}/answer`, { method: "POST", body: JSON.stringify(body) }),

  submitSessionOutcome: (sessionId: string, body: { outcome: "hard" | "good" | "easy" }) =>
    request<SessionSubmitOutcomeResponse>(`/api/learning/sessions/${sessionId}/outcome`, { method: "POST", body: JSON.stringify(body) }),

  completeLearningSession: (sessionId: string) =>
    request<SessionSummary>(`/api/learning/sessions/${sessionId}/complete`, { method: "POST" }),

  exitLearningSession: (sessionId: string) =>
    request<SessionSummary>(`/api/learning/sessions/${sessionId}/exit`, { method: "POST" }),

  reviewDifficultWords: (sessionId: string) =>
    request<StartSessionResponse>(`/api/learning/sessions/${sessionId}/review-difficult`, { method: "POST" }),
};

export type SessionTestType = "multiple_choice" | "english_to_meaning" | "meaning_to_english" | "fill_blank" | "spelling";
export type SessionType = "daily_review" | "new_words" | "focused_word";

export interface SessionQuestionOption {
  key: "A" | "B" | "C" | "D";
  text: string;
}

export interface SessionQuestion {
  userVocabularyId: string;
  wordId: string;
  word: string;
  testType: SessionTestType;
  prompt: string;
  options?: SessionQuestionOption[];
  sentence?: string;
  phonetic?: string | null;
}

export interface SessionProgress {
  totalItems: number;
  currentIndex: number;
}

export interface StartSessionResponse {
  sessionId: string;
  type: SessionType;
  progress: SessionProgress;
  question: SessionQuestion;
}

export interface SessionInfo {
  sessionId: string;
  type: SessionType;
  status: "in_progress" | "completed" | "exited";
  totalItems: number;
  currentIndex: number;
  correctCount: number;
  incorrectCount: number;
  startedAt: string;
}

export interface RecordedMasteryUpdate {
  previousStatus: VocabularyStatus;
  newStatus: VocabularyStatus;
  previousMasteryScore: number;
  newMasteryScore: number;
  needsReview: boolean;
  nextReviewAt: string;
}

export interface SessionSubmitAnswerResponse {
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
  exampleSentence: string | null;
  requiresOutcomeChoice: boolean;
  masteryUpdate: RecordedMasteryUpdate | null;
  sessionComplete: boolean;
  nextQuestion: SessionQuestion | null;
  progress: SessionProgress;
}

export interface SessionSubmitOutcomeResponse {
  masteryUpdate: RecordedMasteryUpdate;
  sessionComplete: boolean;
  nextQuestion: SessionQuestion | null;
  progress: SessionProgress;
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
  status: "completed" | "exited";
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

export type TestType =
  | "english_to_meaning"
  | "meaning_to_english"
  | "multiple_choice"
  | "fill_blank"
  | "sentence_completion"
  | "context_recognition"
  | "spelling"
  | "listening"
  | "active_usage"
  | "ai_conversation";

export type ReviewOutcome = "again" | "hard" | "good" | "easy" | "dont_know";

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
