import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type Candidate, type Product } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";

export function ProductReview() {
  const { jobId, productId } = useParams<{ jobId: string; productId: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!productId) return;
    const res = await api.getProduct(productId);
    setProduct(res.product);
    setCandidates(res.candidates);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;
  if (!product) return <div className="text-red-600 text-sm">Product not found.</div>;

  const notes: string[] = product.verificationNotes ? JSON.parse(product.verificationNotes) : [];
  const imgSrc = product.localImagePath
    ? `/storage/${product.localImagePath}`
    : product.imageUrl ?? null;

  return (
    <div className="flex flex-col gap-5 pb-10">
      <Link to={`/jobs/${jobId}`} className="text-sm text-brand-700 self-start">
        ← Back to job
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card overflow-hidden">
          <div className="aspect-square bg-slate-100 flex items-center justify-center">
            {imgSrc ? (
              <img src={imgSrc} alt={product.styleCode} className="w-full h-full object-contain" />
            ) : (
              <span className="text-slate-300 text-sm">No image selected</span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-slate-900">{product.styleCode}</h1>
              <StatusBadge status={product.status} />
            </div>
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Colour</dt>
              <dd className="text-slate-800 font-medium">{product.colour}</dd>
              <dt className="text-slate-500">Category</dt>
              <dd className="text-slate-800 font-medium">{product.category}</dd>
              <dt className="text-slate-500">Confidence</dt>
              <dd className="text-slate-800 font-medium">{product.confidence}%</dd>
              <dt className="text-slate-500">Source</dt>
              <dd className="text-slate-800 font-medium truncate">{product.sourceName ?? "—"}</dd>
            </dl>
            {product.sourceUrl && (
              <a
                href={product.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-700 underline break-all"
              >
                {product.sourceUrl}
              </a>
            )}
            {product.errorMessage && (
              <div className="text-xs text-red-600 bg-red-50 rounded p-2">{product.errorMessage}</div>
            )}
          </div>

          {notes.length > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Verification Evidence</h2>
              <ul className="text-xs text-slate-600 flex flex-col gap-1 list-disc pl-4">
                {notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              className="btn-success"
              disabled={busy || !product.imageUrl}
              onClick={() => run(() => api.approveProduct(product.id))}
            >
              ✓ Approve
            </button>
            <button className="btn-danger" disabled={busy} onClick={() => run(() => api.rejectProduct(product.id))}>
              ✕ Reject
            </button>
            <button className="btn-secondary" disabled={busy} onClick={() => run(() => api.searchAgain(product.id))}>
              ↻ Search Again
            </button>
            <button
              className="btn-secondary"
              disabled={busy || candidates.length === 0}
              onClick={() => setShowCompare((s) => !s)}
            >
              🖼 Find Another Image
            </button>
            <button className="btn-secondary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              ⬆ Upload Image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) run(() => api.uploadProductImage(product.id, file));
              }}
            />
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}
        </div>
      </div>

      {showCompare && (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-slate-900">Compare Candidates ({candidates.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {candidates.map((c) => {
              const evidence: string[] = c.evidence ? JSON.parse(c.evidence) : [];
              return (
                <div key={c.id} className={`card p-3 flex flex-col gap-2 ${c.chosen ? "ring-2 ring-brand-500" : ""}`}>
                  <div className="aspect-video bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt={c.title ?? ""} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-slate-300 text-xs">No image</span>
                    )}
                  </div>
                  <div className="text-xs font-medium text-slate-800 truncate">{c.title || c.domain}</div>
                  <div className="text-xs text-slate-500 truncate">{c.domain}</div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className={`badge ${c.styleCodeMatch ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      Code {c.styleCodeMatch ? "✓" : "✗"}
                    </span>
                    <span className={`badge ${c.colourMatch ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      Colour {c.colourMatch ? "✓" : "?"}
                    </span>
                    <span className="badge bg-slate-100 text-slate-600">{c.confidence}%</span>
                  </div>
                  {evidence.length > 0 && (
                    <ul className="text-[11px] text-slate-500 list-disc pl-3">
                      {evidence.slice(0, 3).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    className="btn-secondary !py-1.5 text-xs mt-auto"
                    disabled={busy || c.chosen}
                    onClick={() => run(() => api.selectCandidate(product.id, c.id))}
                  >
                    {c.chosen ? "Currently Selected" : "Use This Image"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
