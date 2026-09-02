import type { VocabularyStatus } from "../api/client";

const STYLES: Record<VocabularyStatus, string> = {
  new: "bg-slate-100 text-slate-600",
  learning: "bg-amber-100 text-amber-700",
  familiar: "bg-sky-100 text-sky-700",
  mastered: "bg-emerald-100 text-emerald-700",
};

const LABELS: Record<VocabularyStatus, string> = {
  new: "New",
  learning: "Learning",
  familiar: "Familiar",
  mastered: "Mastered",
};

// "Needs Review" is deliberately not a fifth status value - it's an
// overlay on top of whatever status the word already has, matching the
// needs_review boolean column rather than duplicating it as a status.
export function StatusBadge({ status, needsReview }: { status: VocabularyStatus; needsReview?: boolean }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`badge ${STYLES[status]}`}>{LABELS[status]}</span>
      {needsReview && <span className="badge bg-red-100 text-red-700">Needs Review</span>}
    </div>
  );
}
