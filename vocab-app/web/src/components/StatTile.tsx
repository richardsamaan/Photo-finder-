export function StatTile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? "text-slate-900"}`}>{value.toLocaleString()}</p>
    </div>
  );
}
