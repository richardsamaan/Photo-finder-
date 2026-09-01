import { Link } from "react-router-dom";
import type { Product } from "../api/client";
import { StatusBadge } from "./StatusBadge";

export function ProductCard({
  product,
  selected,
  onToggleSelect,
}: {
  product: Product;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const imgSrc = product.localImagePath
    ? `/storage/${product.localImagePath}`
    : product.imageUrl ?? null;

  return (
    <div className="card overflow-hidden flex flex-col relative group">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onToggleSelect(product.id);
        }}
        className={`absolute top-2 left-2 z-10 h-6 w-6 rounded-md border-2 flex items-center justify-center text-xs font-bold transition ${
          selected ? "bg-brand-600 border-brand-600 text-white" : "bg-white/90 border-slate-300 text-transparent"
        }`}
        aria-label="Select product"
      >
        ✓
      </button>
      <Link to={`/jobs/${product.jobId}/products/${product.id}`} className="flex flex-col flex-1">
        <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center overflow-hidden">
          {imgSrc ? (
            <img src={imgSrc} alt={`${product.styleCode} ${product.colour}`} className="w-full h-full object-cover" />
          ) : (
            <span className="text-slate-300 text-xs px-2 text-center">No image yet</span>
          )}
        </div>
        <div className="p-2.5 sm:p-3 flex flex-col gap-1.5 flex-1">
          <div className="flex items-start justify-between gap-1">
            <span className="font-semibold text-slate-900 text-sm truncate">{product.styleCode}</span>
            {product.confidence > 0 && (
              <span className="text-xs font-medium text-slate-500 shrink-0">{product.confidence}%</span>
            )}
          </div>
          <div className="text-xs text-slate-500 truncate">
            {product.colour} · {product.category}
          </div>
          <div className="mt-auto pt-1">
            <StatusBadge status={product.status} />
          </div>
        </div>
      </Link>
    </div>
  );
}
