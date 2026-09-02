import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center space-y-2">
      <p className="text-base font-medium text-slate-700">{title}</p>
      <p className="text-sm text-slate-500">{description}</p>
      {action}
    </div>
  );
}
