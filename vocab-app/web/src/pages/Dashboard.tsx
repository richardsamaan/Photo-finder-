import { useEffect, useState } from "react";
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
      <div className="card p-5">
        <h2 className="text-sm font-medium text-slate-500 mb-2">Backend connection</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && !health && <p className="text-sm text-slate-500">Checking...</p>}
        {health && (
          <div className="space-y-1 text-sm text-slate-700">
            <p>Connected - Phase {health.phase} scaffold running.</p>
            <p className="text-slate-500">
              AI provider: {health.aiProvider} ({health.aiConfigured ? "configured" : "not configured"})
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
