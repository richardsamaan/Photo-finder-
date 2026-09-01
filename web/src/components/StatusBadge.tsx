const STYLES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  queued: "bg-slate-100 text-slate-600",
  searching: "bg-blue-100 text-blue-700 animate-pulse",
  high_confidence: "bg-emerald-100 text-emerald-700",
  medium_confidence: "bg-amber-100 text-amber-700",
  needs_review: "bg-orange-100 text-orange-700",
  not_found: "bg-slate-200 text-slate-600",
  approved: "bg-emerald-600 text-white",
  rejected: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
};

const LABELS: Record<string, string> = {
  pending: "Pending",
  queued: "Queued",
  searching: "Searching…",
  high_confidence: "High Confidence",
  medium_confidence: "Medium Confidence",
  needs_review: "Needs Review",
  not_found: "Image Not Found",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${STYLES[status] ?? "bg-slate-100 text-slate-600"}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
