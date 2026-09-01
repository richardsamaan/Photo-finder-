import { Link, useLocation } from "react-router-dom";

export function Navbar() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="mx-auto max-w-6xl px-3 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-slate-900 text-sm sm:text-base">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white text-lg">
            📷
          </span>
          <span className="hidden xs:inline sm:inline">Product Image Finder</span>
        </Link>
        {!isHome && (
          <Link to="/" className="btn-secondary !py-1.5 !px-3 text-xs sm:text-sm">
            ← All Imports
          </Link>
        )}
      </div>
    </header>
  );
}
