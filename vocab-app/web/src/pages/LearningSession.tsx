import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  api,
  type LearningStats,
  type SessionQuestion,
  type SessionType,
  type SessionSubmitAnswerResponse,
  type SessionSubmitOutcomeResponse,
  type SessionSummary,
} from "../api/client";
import { SpeakButton } from "../components/SpeakButton";
import { StatTile } from "../components/StatTile";

type Stage = "select" | "loading" | "question" | "feedback" | "complete" | "error";

// A correct-answer result and an outcome result share every field the
// feedback screen needs except masteryUpdate/requiresOutcomeChoice - this
// type lets the "Continue" and "Hard/Good/Easy" paths render from the same
// state without a jarring re-render between them.
interface FeedbackState {
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
  exampleSentence: string | null;
  awaitingOutcome: boolean;
  masteryUpdate: SessionSubmitAnswerResponse["masteryUpdate"] | SessionSubmitOutcomeResponse["masteryUpdate"];
  sessionComplete: boolean;
  nextQuestion: SessionQuestion | null;
  nextProgress: { totalItems: number; currentIndex: number };
}

const TEST_TYPE_LABEL: Record<SessionQuestion["testType"], string> = {
  multiple_choice: "Multiple choice",
  english_to_meaning: "Define it",
  meaning_to_english: "Name the word",
  fill_blank: "Fill in the blank",
  spelling: "Spelling",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function LearningSession() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>("select");
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<LearningStats | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionType, setSessionType] = useState<SessionType | null>(null);
  const [question, setQuestion] = useState<SessionQuestion | null>(null);
  const [progress, setProgress] = useState<{ totalItems: number; currentIndex: number } | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  const [answerText, setAnswerText] = useState("");
  const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startedAtRef = useRef<number>(Date.now());

  const loadStats = useCallback(() => {
    api.getLearningStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const beginSession = useCallback(async (type: SessionType, wordId?: string) => {
    setStage("loading");
    setError(null);
    try {
      const res = await api.startLearningSession({ type, wordId });
      setSessionId(res.sessionId);
      setSessionType(res.type);
      setProgress(res.progress);
      setQuestion(res.question);
      setFeedback(null);
      setSummary(null);
      setAnswerText("");
      setSelectedOptionKey(null);
      startedAtRef.current = Date.now();
      setStage("question");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start this session.");
      setStage("error");
    }
  }, []);

  // Auto-start from a URL param: /learn?practice=<wordId> (Word Detail's
  // "Practice this word") or /learn?type=daily_review|new_words.
  useEffect(() => {
    const practiceWordId = searchParams.get("practice");
    const paramType = searchParams.get("type");
    if (practiceWordId) {
      beginSession("focused_word", practiceWordId);
      setSearchParams({}, { replace: true });
    } else if (paramType === "daily_review" || paramType === "new_words") {
      beginSession(paramType);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function advanceTo(nextQuestion: SessionQuestion | null, nextProgress: { totalItems: number; currentIndex: number }, complete: boolean, finalSummary?: SessionSummary) {
    setProgress(nextProgress);
    if (complete) {
      const s = finalSummary ?? null;
      if (s) setSummary(s);
      setStage("complete");
      loadStats();
      return;
    }
    setQuestion(nextQuestion);
    setFeedback(null);
    setAnswerText("");
    setSelectedOptionKey(null);
    startedAtRef.current = Date.now();
    setStage("question");
  }

  async function handleSubmit(submittedText: string | null) {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const responseTimeMs = Date.now() - startedAtRef.current;
      const res = await api.submitSessionAnswer(sessionId, { submittedText, responseTimeMs });
      setFeedback({
        isCorrect: res.isCorrect,
        correctAnswer: res.correctAnswer,
        explanation: res.explanation,
        exampleSentence: res.exampleSentence,
        awaitingOutcome: res.requiresOutcomeChoice,
        masteryUpdate: res.masteryUpdate,
        sessionComplete: res.sessionComplete,
        nextQuestion: res.nextQuestion,
        nextProgress: res.progress,
      });
      setStage("feedback");
      if (!res.requiresOutcomeChoice && res.sessionComplete) {
        // Wrong answer on the last item - fetch the real summary now.
        const s = await api.completeLearningSession(sessionId);
        setSummary(s);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit this answer.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOutcome(outcome: "hard" | "good" | "easy") {
    if (!sessionId || !feedback || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.submitSessionOutcome(sessionId, { outcome });
      setFeedback({
        ...feedback,
        awaitingOutcome: false,
        masteryUpdate: res.masteryUpdate,
        sessionComplete: res.sessionComplete,
        nextQuestion: res.nextQuestion,
        nextProgress: res.progress,
      });
      if (res.sessionComplete) {
        const s = await api.completeLearningSession(sessionId);
        setSummary(s);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record that outcome.");
    } finally {
      setBusy(false);
    }
  }

  function handleContinue() {
    if (!feedback) return;
    advanceTo(feedback.nextQuestion, feedback.nextProgress, feedback.sessionComplete);
  }

  async function handleExit() {
    if (!sessionId) return;
    if (!window.confirm("Exit this session? Words you've already answered will be saved - the rest won't count as completed.")) return;
    setBusy(true);
    try {
      const s = await api.exitLearningSession(sessionId);
      setSummary(s);
      setStage("complete");
      loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not exit this session.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReviewDifficult() {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.reviewDifficultWords(sessionId);
      setSessionId(res.sessionId);
      setSessionType(res.type);
      setProgress(res.progress);
      setQuestion(res.question);
      setFeedback(null);
      setSummary(null);
      setAnswerText("");
      setSelectedOptionKey(null);
      startedAtRef.current = Date.now();
      setStage("question");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start a difficult-words session.");
    } finally {
      setBusy(false);
    }
  }

  if (stage === "select" || stage === "loading") {
    return (
      <div className="max-w-md mx-auto space-y-5 pb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Learn</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="card p-6 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Daily Review</h2>
          <p className="text-sm text-slate-600">Review words that are due, prioritized by what needs it most.</p>
          {stats && <p className="text-xs text-slate-400">{stats.dueToday + stats.overdue} due right now</p>}
          <button className="btn-primary w-full" disabled={stage === "loading"} onClick={() => beginSession("daily_review")}>
            Start Daily Review
          </button>
        </div>

        <div className="card p-6 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Learn New Words</h2>
          <p className="text-sm text-slate-600">Meet new words from your vocabulary bank for the first time.</p>
          {stats && <p className="text-xs text-slate-400">{stats.new} new words available</p>}
          <button className="btn-secondary w-full" disabled={stage === "loading"} onClick={() => beginSession("new_words")}>
            Start Learning New Words
          </button>
        </div>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="max-w-md mx-auto space-y-4 pb-8">
        <p className="text-sm text-red-600">{error}</p>
        <button className="btn-secondary" onClick={() => setStage("select")}>
          Back
        </button>
      </div>
    );
  }

  if (stage === "complete") {
    const s = summary;
    return (
      <div className="max-w-md mx-auto space-y-5 pb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Session complete</h1>
        {!s ? (
          <p className="text-sm text-slate-500">Loading summary...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Correct" value={s.correctCount} accent="text-emerald-600" />
              <StatTile label="Incorrect" value={s.incorrectCount} accent="text-red-600" />
              <StatTile label="Success rate" value={s.successRate} />
              <StatTile label="Needs review" value={s.wordsNeedingReview} />
            </div>

            <div className="card p-5 space-y-2">
              <h2 className="text-sm font-medium text-slate-700">Vocabulary growth</h2>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-emerald-700">{s.learnedThroughAppTouched}</span> word
                {s.learnedThroughAppTouched === 1 ? "" : "s"} learned through the app
                {s.knownBeforeAppTouched > 0 && (
                  <>
                    {" "}
                    and <span className="font-semibold text-slate-700">{s.knownBeforeAppTouched}</span> already known before
                    the app
                  </>
                )}
                .
              </p>
              <p className="text-xs text-slate-400">
                Only words you didn't already know before using this app count toward vocabulary growth - reviewing a
                word you already knew keeps it sharp, but isn't new vocabulary.
              </p>
            </div>

            <p className="text-xs text-slate-400 text-center">
              {s.completedItems} of {s.totalItems} questions completed - {formatDuration(s.durationSeconds)}
            </p>

            <div className="space-y-3">
              {s.incorrectCount > 0 && (
                <button className="btn-primary w-full" disabled={busy} onClick={handleReviewDifficult}>
                  Review difficult words
                </button>
              )}
              <button className="btn-secondary w-full" onClick={() => navigate("/vocabulary")}>
                Back to My Vocabulary
              </button>
              <button className="text-sm text-slate-500 w-full text-center" onClick={() => setStage("select")}>
                Choose another session
              </button>
            </div>
          </>
        )}
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </div>
    );
  }

  // stage === "question" | "feedback"
  if (!question || !progress) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="max-w-md mx-auto space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {progress.currentIndex + 1} of {progress.totalItems}
        </p>
        <button className="text-sm text-slate-500" onClick={handleExit} disabled={busy}>
          Exit
        </button>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div
          className="h-1.5 rounded-full bg-brand-600 transition-all"
          style={{ width: `${Math.round(((stage === "feedback" ? progress.currentIndex + 1 : progress.currentIndex) / progress.totalItems) * 100)}%` }}
        />
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{TEST_TYPE_LABEL[question.testType]}</span>
          {question.word && <SpeakButton text={question.word} />}
        </div>

        <p className="text-lg font-medium text-slate-900">{question.prompt}</p>

        {question.sentence && <p className="text-slate-700 italic">"{question.sentence}"</p>}

        {stage === "question" && (
          <>
            {question.testType === "multiple_choice" ? (
              <div className="space-y-2">
                {question.options?.map((opt) => (
                  <button
                    key={opt.key}
                    disabled={busy}
                    onClick={() => {
                      setSelectedOptionKey(opt.key);
                      handleSubmit(opt.text);
                    }}
                    className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition ${
                      selectedOptionKey === opt.key ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span className="font-semibold text-slate-400 mr-2">{opt.key}</span>
                    {opt.text}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  autoFocus
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && answerText.trim() && !busy) handleSubmit(answerText.trim());
                  }}
                  placeholder="Type your answer"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <button className="btn-secondary" disabled={busy} onClick={() => handleSubmit(null)}>
                    I don't know
                  </button>
                  <button className="btn-primary" disabled={busy || !answerText.trim()} onClick={() => handleSubmit(answerText.trim())}>
                    Submit
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {stage === "feedback" && feedback && (
          <div className="space-y-4">
            <div
              className={`rounded-xl px-4 py-3 text-sm font-medium ${
                feedback.isCorrect ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}
            >
              {feedback.isCorrect ? "Correct!" : "Not quite."}
            </div>
            {!feedback.isCorrect && (
              <p className="text-sm text-slate-700">
                Correct answer: <span className="font-semibold">{feedback.correctAnswer}</span>
              </p>
            )}
            <p className="text-sm text-slate-600">{feedback.explanation}</p>
            {feedback.exampleSentence && <p className="text-sm text-slate-500 italic">"{feedback.exampleSentence}"</p>}

            {feedback.awaitingOutcome ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">How easily did that come to you?</p>
                <div className="grid grid-cols-3 gap-2">
                  <button className="btn-secondary text-sm py-2" disabled={busy} onClick={() => handleOutcome("hard")}>
                    Hard
                  </button>
                  <button className="btn-secondary text-sm py-2" disabled={busy} onClick={() => handleOutcome("good")}>
                    Good
                  </button>
                  <button className="btn-secondary text-sm py-2" disabled={busy} onClick={() => handleOutcome("easy")}>
                    Easy
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-primary w-full" onClick={handleContinue}>
                {feedback.sessionComplete ? "See results" : "Continue"}
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
    </div>
  );
}
