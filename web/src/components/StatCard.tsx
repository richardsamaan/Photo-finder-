export function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const toneClasses: Record<string, string> = {
    default: "text-slate-900",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
    info: "text-brand-600",
  };
  return (
    <div className="card p-3 sm:p-4 flex flex-col gap-1 min-w-0">
      <span className="text-[11px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide truncate">
        {label}
      </span>
      <span className={`text-xl sm:text-2xl font-bold ${toneClasses[tone]}`}>{value}</span>
    </div>
  );
}
