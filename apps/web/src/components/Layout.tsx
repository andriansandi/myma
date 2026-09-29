import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  to: string;
  label: string;
}

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard" },
  { to: "/instances", label: "Instances" },
  { to: "/students", label: "Students" },
  { to: "/nodes", label: "VPS Nodes" },
  { to: "/backups", label: "Backups" },
  { to: "/activity", label: "Activity Logs" },
  { to: "/settings", label: "Settings" },
];

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 px-5 py-4">
          <span className="text-lg font-bold tracking-tight text-slate-900">
            MyMA
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <h1 className="text-base font-semibold text-slate-900">MyMA</h1>
            <p className="text-xs text-slate-500">My Moodle Manager</p>
          </div>
        </header>

        <main className="flex-1 p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
