import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, type Product, type DomainFilterMode, type SiteHealthEntry } from "../api/client";
import { useJobPolling } from "../hooks/useJobPolling";
import { StatCard } from "../components/StatCard";
import { ProgressBar } from "../components/ProgressBar";
import { ProductCard } from "../components/ProductCard";

const DOMAIN_FILTER_LABELS: Record<DomainFilterMode, string> = {
  none: "No restriction",
  official_only: "Official brand domain only",
  official_plus_allowlist: "Official domain + trusted retailers",
};

const FILTERS: { key: string; label: string; statuses?: string[] }[] = [
  { key: "all", label: "All" },
  { key: "high_confidence", label: "High Confidence", statuses: ["high_confidence"] },
  { key: "medium_confidence", label: "Medium", statuses: ["medium_confidence"] },
  { key: "needs_review", label: "Needs Review", statuses: ["needs_review"] },
  { key: "not_found", label: "Not Found", statuses: ["not_found"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
  { key: "failed", label: "Failed", statuses: ["failed"] },
  { key: "pending", label: "Pending", statuses: ["pending", "queued", "searching"] },
];

export function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data, error, refresh } = useJobPolling(jobId);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    api
      .listProducts(jobId)
      .then((r) => setProducts(r.products))
      .catch(() => {});
  }, [jobId, data?.stats]);

  const filtered = useMemo(() => {
    if (!products) return [];
    let list = products;
    const filterDef = FILTERS.find((f) => f.key === activeFilter);
    if (filterDef?.statuses) list = list.filter((p) => filterDef.statuses!.includes(p.status));
    if (category !== "all") list = list.filter((p) => p.category === category);
    return list;
  }, [products, activeFilter, category]);

  async function runAction(fn: () => Promise<unknown>) {
    setActionError(null);
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (error) return <div className="card p-4 text-red-600 text-sm">{error}</div>;
  if (!data) return <div className="text-slate-500 text-sm">Loading…</div>;

  const { job, stats, categories, runnerState, siteHealth } = data;
  const isRunning = job.status === "running" || runnerState === "running";
  const isPaused = job.status === "paused" || runnerState === "paused";

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">{job.filename}</h1>
          <p className="text-sm text-slate-500">Job status: {job.status}</p>
        </div>
      </div>

      <ProgressBar value={job.processedProducts} max={job.totalProducts} />

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || isRunning} onClick={() => runAction(() => api.startJob(job.id))}>
          ▶ Start Search
        </button>
        <button className="btn-secondary" disabled={busy || !isRunning} onClick={() => runAction(() => api.pauseJob(job.id))}>
          ⏸ Pause
        </button>
        <button className="btn-secondary" disabled={busy || !isPaused} onClick={() => runAction(() => api.resumeJob(job.id))}>
          ▶ Resume
        </button>
        <button
          className="btn-danger"
          disabled={busy || (!isRunning && !isPaused)}
          onClick={() => runAction(() => api.cancelJob(job.id))}
        >
          ✕ Cancel
        </button>
        <button className="btn-secondary" disabled={busy || isRunning} onClick={() => runAction(() => api.retryFailed(job.id))}>
          ↻ Retry Failed
        </button>
        <button
          className="btn-secondary"
          disabled={busy || isRunning || selected.size === 0}
          onClick={() => runAction(() => api.startJob(job.id, Array.from(selected)))}
        >
          Search Selected ({selected.size})
        </button>
      </div>

      {actionError && <div className="text-red-600 text-sm">{actionError}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        <StatCard label="Total Products" value={stats.totalProducts} />
        <StatCard label="Images Found" value={stats.imagesFound} tone="info" />
        <StatCard label="High Confidence" value={stats.highConfidence} tone="success" />
        <StatCard label="Needs Review" value={stats.needsReview} tone="warning" />
        <StatCard label="Not Found" value={stats.notFound} tone="danger" />
        <StatCard label="Approved" value={stats.approved} tone="success" />
        <StatCard label="Rejected" value={stats.rejected} />
        <StatCard label="Failed" value={stats.failed} tone="danger" />
        <StatCard label="Pending" value={stats.pending} />
        <StatCard label="Medium Confidence" value={stats.mediumConfidence} tone="warning" />
      </div>

      <DomainFilterSettings
        jobId={job.id}
        domainFilterMode={job.domainFilterMode}
        officialDomain={job.officialDomain}
        onUpdated={refresh}
      />

      <SiteHealthPanel siteHealth={siteHealth} />

      <ExportPanel jobId={job.id} approvedCount={stats.approved} categories={categories} notFoundCount={stats.notFound} />

      <div className="flex flex-col gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs sm:text-sm font-medium border ${
                activeFilter === f.key
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-slate-600 border-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setCategory("all")}
            className={`shrink-0 rounded-full px-3 py-1 text-xs border ${
              category === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200"
            }`}
          >
            All Categories
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs border ${
                category === c ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {products === null ? (
        <div className="text-slate-500 text-sm">Loading products…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-slate-400 text-sm">No products match this filter.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} selected={selected.has(p.id)} onToggleSelect={toggleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function DomainFilterSettings({
  jobId,
  domainFilterMode,
  officialDomain,
  onUpdated,
}: {
  jobId: string;
  domainFilterMode: DomainFilterMode;
  officialDomain: string | null;
  onUpdated: () => Promise<unknown> | void;
}) {
  const [mode, setMode] = useState<DomainFilterMode>(domainFilterMode);
  const [domain, setDomain] = useState(officialDomain ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setMode(domainFilterMode);
    setDomain(officialDomain ?? "");
  }, [domainFilterMode, officialDomain]);

  const dirty = mode !== domainFilterMode || domain !== (officialDomain ?? "");
  const invalid = mode !== "none" && !domain.trim();

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await api.updateJobSettings(jobId, { domainFilterMode: mode, officialDomain: mode === "none" ? null : domain });
      await onUpdated();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4 flex flex-col gap-3">
      <h2 className="font-semibold text-slate-900 text-sm">Source domain restriction</h2>
      <select
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white max-w-sm"
        value={mode}
        onChange={(e) => setMode(e.target.value as DomainFilterMode)}
      >
        {(Object.keys(DOMAIN_FILTER_LABELS) as DomainFilterMode[]).map((m) => (
          <option key={m} value={m}>
            {DOMAIN_FILTER_LABELS[m]}
          </option>
        ))}
      </select>
      {mode !== "none" && (
        <input
          type="text"
          placeholder="e.g. hugoboss.com"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white max-w-sm"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
      )}
      {dirty && (
        <button className="btn-secondary w-fit" disabled={saving || invalid} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      )}
      {err && <div className="text-sm text-red-600">{err}</div>}
    </div>
  );
}

/**
 * Per-site success/failure counters (searchProviders/health.ts) - process-wide
 * (not scoped to this one job), reset when the server restarts. Lets an
 * operator spot at a glance whether a specific retailer's adapter is
 * currently being blocked/rate-limited without treating it as a hard
 * pipeline failure - a failing site is simply skipped per item.
 */
function SiteHealthPanel({ siteHealth }: { siteHealth: Record<string, SiteHealthEntry> }) {
  const entries = Object.entries(siteHealth).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return (
      <div className="card p-4 text-sm text-slate-500">
        Site health: no searches run yet this server session.
      </div>
    );
  }

  return (
    <div className="card p-4 flex flex-col gap-2">
      <h2 className="font-semibold text-slate-900 text-sm">Site Health (this server session)</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {entries.map(([site, h]) => {
          const healthy = h.attempts === 0 || h.failed / h.attempts < 0.5;
          return (
            <div
              key={site}
              className={`rounded-lg border px-3 py-2 text-xs ${
                healthy ? "border-slate-200 bg-white" : "border-red-200 bg-red-50"
              }`}
            >
              <div className="font-medium text-slate-700">{site}</div>
              <div className={healthy ? "text-slate-500" : "text-red-700"}>
                {h.succeeded}/{h.attempts} succeeded · {h.resultsReturned} result(s) returned
                {h.failed > 0 && !healthy && " · check this adapter"}
              </div>
              {h.lastError && !healthy && (
                <div className="text-red-500 truncate" title={h.lastError}>
                  {h.lastError}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExportPanel({
  jobId,
  approvedCount,
  categories,
  notFoundCount,
}: {
  jobId: string;
  approvedCount: number;
  categories: string[];
  notFoundCount: number;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function generatePdfs() {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.generatePdfs(jobId);
      setMsg(`Generated ${res.categories.length} category PDF(s) + master catalog.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to generate PDFs.");
    } finally {
      setBusy(false);
    }
  }

  async function generateZip() {
    setBusy(true);
    setErr(null);
    try {
      await api.generateZip(jobId);
      setMsg("ZIP generated. Ready to download below.");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to generate ZIP.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Export Catalog</h2>
        <span className="text-xs text-slate-500">{approvedCount} approved product(s)</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={busy || approvedCount === 0} onClick={generatePdfs}>
          📄 Generate PDFs
        </button>
        <button className="btn-secondary" disabled={busy || approvedCount === 0} onClick={generateZip}>
          🗜 Generate ZIP
        </button>
        <a className="btn-primary" href={`/api/export/${jobId}/download/master-pdf`}>
          ⬇ Master PDF
        </a>
        <a className="btn-success" href={`/api/export/${jobId}/download/catalog-zip`}>
          ⬇ Download ZIP
        </a>
        {notFoundCount > 0 && (
          <a className="btn-secondary" href={`/api/export/${jobId}/download/not-found.xlsx`}>
            ⬇ Not Found ({notFoundCount}).xlsx
          </a>
        )}
      </div>
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {categories.map((c) => (
            <a
              key={c}
              href={`/api/export/${jobId}/download/category-pdf/${encodeURIComponent(c)}`}
              className="text-xs underline text-brand-700"
            >
              {c}.pdf
            </a>
          ))}
        </div>
      )}
      {msg && <div className="text-sm text-emerald-600">{msg}</div>}
      {err && <div className="text-sm text-red-600">{err}</div>}
    </div>
  );
}
