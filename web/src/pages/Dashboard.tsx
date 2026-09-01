import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Job } from "../api/client";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending: "bg-slate-100 text-slate-600",
  running: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-200 text-slate-600",
  failed: "bg-red-100 text-red-700",
};

export function Dashboard() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listJobs()
      .then((r) => setJobs(r.jobs))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Your Imports</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload a product list to find and catalog real product images from the web.
          </p>
        </div>
        <Link to="/import" className="btn-primary w-full sm:w-auto">
          + New Import
        </Link>
      </div>

      {error && <div className="card p-4 text-red-600 text-sm">{error}</div>}

      {!jobs && !error && <div className="text-slate-500 text-sm">Loading…</div>}

      {jobs && jobs.length === 0 && (
        <div className="card p-8 text-center text-slate-500">
          <p className="text-4xl mb-2">📂</p>
          <p className="font-medium text-slate-700">No imports yet</p>
          <p className="text-sm mt-1">Upload an Excel or CSV file of products to get started.</p>
          <Link to="/import" className="btn-primary mt-4 inline-flex">
            Upload File
          </Link>
        </div>
      )}

      {jobs && jobs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {jobs.map((job) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="card p-4 flex flex-col gap-3 hover:shadow-md hover:border-brand-300 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-slate-900 truncate">{job.filename}</span>
                <span className={`badge shrink-0 ${STATUS_COLORS[job.status] ?? "bg-slate-100 text-slate-600"}`}>
                  {job.status}
                </span>
              </div>
              <div className="text-sm text-slate-500">
                {job.processedProducts} / {job.totalProducts} processed
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{
                    width: `${job.totalProducts > 0 ? Math.round((job.processedProducts / job.totalProducts) * 100) : 0}%`,
                  }}
                />
              </div>
              <div className="text-xs text-slate-400">{new Date(job.createdAt).toLocaleString()}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
