import { NavLink } from "react-router";
import { Home, MapPinned, ListOrdered, BarChart3 } from "lucide-react";
import { cx } from "./ui";

const TABS = [
  { to: "/", label: "Home", Icon: Home, end: true },
  { to: "/courses", label: "Courses", Icon: MapPinned },
  { to: "/rounds", label: "Rounds", Icon: ListOrdered },
  { to: "/stats", label: "Stats", Icon: BarChart3 },
];

export function TabBar() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-center border-t border-lime/30 bg-surface" aria-label="Main">
      <div className="flex h-16 w-full max-w-[480px]">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx("label flex flex-1 flex-col items-center justify-center gap-1.5 uppercase transition-colors duration-150 ease", isActive ? "text-lime" : "text-ink-3")}>
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.6 : 2} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
