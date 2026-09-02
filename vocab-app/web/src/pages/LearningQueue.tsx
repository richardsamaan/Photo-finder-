import { useCallback, useEffect, useState } from "react";
import { api, type LearningStats, type QueueItem, type ReviewOutcome } from "../api/client";

// A minimal, internal screen to verify the mastery/SRS engine end to end -
// not the polished Daily Review experience (that's a later phase). Every
// button submits a real review through the same engine the future review
// UI will use; nothing here is a mock.
export function LearningQueue() {
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getLearningStats().then(setStats).catch((e) => setError(e instanceof Error ? e.message : "Could not load stats."));
    api.getLearningQueue().then((res) => setItems(res.items)).catch((e) => setError(e instanceof Error ? e.message : "Could not load queue."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(userVocabularyId: string, outcome: ReviewOutcome) {
    setBusyId(userVocabularyId);
    setError(null);
    try {
      await api.recordReview({ userVocabularyId, testType: "multiple_choice", outcome });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record that review.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <h1 className="text-2xl font-semibold text-slate-900">Learning Queue</h1>
      <p className="text-sm text-slate-500">
        Internal screen for verifying the mastery and spaced-repetition engine. The full Daily Review experience is a
        later phase.
      </p>

      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <StatBox label="Due now" value={stats.dueToday} />
          <StatBox label="Overdue" value={stats.overdue} />
          <StatBox label="Needs review" value={stats.needsReview} accent="text-red-600" />
          <StatBox label="New" value={stats.new} />
          <StatBox label="Learning" value={stats.activeLearning} />
          <StatBox label="Mastered" value={stats.mastered} accent="text-emerald-600" />
        </div>
      )}

      {stats && (
        <div className="card p-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
          <span>Average mastery: {stats.averageMastery}%</span>
          <span>Retention rate: {stats.retentionRate}%</span>
          <span>Known before app: {stats.knownBeforeApp}</span>
          <span>Learned through app: {stats.learnedThroughApp}</span>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {items.length === 0 && stats && (
        <div className="card p-8 text-center text-sm text-slate-500">Nothing due right now - you've caught up.</div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.userVocabularyId} className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{item.word}</p>
                <p className="text-xs text-slate-400">
                  {item.status} - reason: {item.reason.replace("_", " ")}
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>base {item.baseMasteryScore}% / effective {item.effectiveMasteryScore}%</p>
                {item.overdueDays > 0 && <p className="text-red-600">{item.overdueDays}d overdue</p>}
                {item.needsReview && <p className="text-red-600">needs review</p>}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                disabled={busyId === item.userVocabularyId}
                onClick={() => submit(item.userVocabularyId, "again")}
                className="btn-secondary text-xs py-2"
              >
                Again
              </button>
              <button
                disabled={busyId === item.userVocabularyId}
                onClick={() => submit(item.userVocabularyId, "hard")}
                className="btn-secondary text-xs py-2"
              >
                Hard
              </button>
              <button
                disabled={busyId === item.userVocabularyId}
                onClick={() => submit(item.userVocabularyId, "good")}
                className="btn-secondary text-xs py-2"
              >
                Good
              </button>
              <button
                disabled={busyId === item.userVocabularyId}
                onClick={() => submit(item.userVocabularyId, "easy")}
                className="btn-secondary text-xs py-2"
              >
                Easy
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${accent ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
