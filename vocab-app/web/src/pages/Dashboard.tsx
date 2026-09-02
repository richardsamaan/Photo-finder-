import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type HealthResponse } from "../api/client";

export function Dashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch((e) => setError(e instanceof Error ? e.message : "Request failed"));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Vocabulary Intelligence Platform</h1>

      <div className="card p-6 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Discover your English vocabulary</h2>
        <p className="text-sm text-slate-600">
          Take a short assessment to find out which words you already know and which ones are worth learning.
        </p>
        <Link to="/assessment" className="btn-primary inline-flex w-full sm:w-auto">
          Start Assessment
        </Link>
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Learn</h2>
        <p className="text-sm text-slate-600">Review words that are due or learn new ones with a short daily session.</p>
        <Link to="/learn" className="btn-primary inline-flex w-full sm:w-auto">
          Start Learning
        </Link>
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">My Vocabulary</h2>
        <p className="text-sm text-slate-600">Browse, search, and organize every word in your personal vocabulary bank.</p>
        <Link to="/vocabulary" className="btn-secondary inline-flex w-full sm:w-auto">
          Open My Vocabulary
        </Link>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-medium text-slate-500 mb-2">Backend connection</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && !health && <p className="text-sm text-slate-500">Checking...</p>}
        {health && (
          <div className="space-y-1 text-sm text-slate-700">
            <p>Connected - Phase {health.phase} running.</p>
            <p className="text-slate-500">
              AI provider: {health.aiProvider} ({health.aiConfigured ? "configured" : "not configured"})
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
