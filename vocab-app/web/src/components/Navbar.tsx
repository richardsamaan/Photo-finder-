import { NavLink } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium ${isActive ? "text-brand-700" : "text-slate-500 hover:text-slate-800"}`;

export function Navbar() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-3 sm:px-6 h-14 flex items-center justify-between">
        <NavLink to="/" className="font-semibold text-slate-900">
          Vocabulary
        </NavLink>
        <nav className="flex items-center gap-5">
          <NavLink to="/" end className={linkClass}>
            Home
          </NavLink>
          <NavLink to="/vocabulary" className={linkClass}>
            My Vocabulary
          </NavLink>
          <NavLink to="/learning" className={linkClass}>
            Learning Queue
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
