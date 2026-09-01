import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type AssessmentQuestion, type AssessmentProgress, type AssessmentResult } from "../api/client";

type Stage = "intro" | "question" | "result";

export function Assessment() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("intro");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<AssessmentQuestion | null>(null);
  const [progress, setProgress] = useState<AssessmentProgress | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setError(null);
    try {
      const res = await api.startAssessment();
      setSessionId(res.sessionId);
      setQuestion(res.question);
      setProgress(res.progress);
      setQuestionStartedAt(Date.now());
      setStage("question");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the assessment.");
    }
  }

  async function handleAnswer(selectedOptionText: string | null) {
    if (!sessionId || !question || submitting) return;
    setSubmitting(true);
    setError(null);
    const responseTimeMs = Date.now() - questionStartedAt;
    try {
      const res = await api.submitAssessmentAnswer(sessionId, { wordId: question.wordId, selectedOptionText, responseTimeMs });
      if (res.result) {
        setResult(res.result);
        setStage("result");
      } else if (res.nextQuestion) {
        setQuestion(res.nextQuestion);
        setProgress(res.progress);
        setQuestionStartedAt(Date.now());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit your answer.");
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "intro") {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">Let's discover your English vocabulary.</h1>
          <p className="text-slate-600">
            This short assessment finds out which words you already know, which ones you recognize but rarely use,
            and which ones are new to you. There's no pass or fail here - answering "I don't know" is just as useful
            as answering correctly, because it helps build your personal learning plan.
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full sm:w-auto text-base py-3.5 px-8" onClick={handleStart}>
          Start Assessment
        </button>
      </div>
    );
  }

  if (stage === "question" && question && progress) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-500">
            Question {progress.current} of {progress.total}
          </p>
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-brand-600 transition-all"
              style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
            />
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">{question.difficultyLevel}</p>
          <h2 className="text-xl font-semibold text-slate-900">{question.prompt}</h2>

          <div className="space-y-3">
            {question.options.map((opt) => (
              <button
                key={opt.key}
                disabled={submitting}
                onClick={() => handleAnswer(opt.text)}
                className="w-full text-left rounded-xl border border-slate-300 bg-white px-4 py-4 text-base text-slate-800 hover:border-brand-500 hover:bg-brand-50 active:scale-[0.99] transition disabled:opacity-50"
              >
                <span className="font-semibold text-brand-600 mr-2">{opt.key}.</span>
                {opt.text}
              </button>
            ))}
          </div>

          <button
            disabled={submitting}
            onClick={() => handleAnswer(null)}
            className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-4 text-base font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            I don't know this word
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (stage === "result" && result) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Your Initial Vocabulary</h1>

        <div className="card p-6 space-y-4">
          <div>
            <p className="text-sm text-slate-500">Estimated vocabulary (based on this short sample)</p>
            <p className="text-3xl font-bold text-slate-900">~{result.estimatedVocabularySize.toLocaleString()} words</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500">Confidently recognized</p>
              <p className="text-xl font-semibold text-slate-900">{result.knownWordCount}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Words to learn</p>
              <p className="text-xl font-semibold text-slate-900">{result.learningWordCount}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Estimated level</p>
              <p className="text-xl font-semibold text-slate-900">{result.estimatedLevel}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Assessment confidence</p>
              <p className="text-xl font-semibold text-slate-900 capitalize">{result.confidence}</p>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            This is an estimate based on a short sample of questions, not an exact measurement of your full
            vocabulary.
          </p>
        </div>

        <div className="rounded-xl border border-brand-100 bg-brand-50 p-6">
          <p className="text-sm font-medium text-brand-700 mb-1">My First Learning Bank</p>
          <p className="text-slate-700">
            You've identified <span className="font-semibold">{result.learningWordCount}</span> word
            {result.learningWordCount === 1 ? "" : "s"} worth learning. They've been added to your vocabulary bank to
            start practicing.
          </p>
        </div>

        <button className="btn-primary w-full sm:w-auto" onClick={() => navigate("/")}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  return null;
}
