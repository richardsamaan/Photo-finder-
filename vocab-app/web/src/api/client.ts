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
};
