"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, LayoutDashboard, GitBranch, BarChart2, LogOut, Sun, Moon } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "@/app/providers";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",         label: "Dashboard",    icon: LayoutDashboard },
  { href: "/dashboard/metrics", label: "Metrics",      icon: BarChart2       },
  { href: "/dashboard/repos",   label: "Repositories", icon: GitBranch       },
];

function Sidebar() {
  const path = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <aside
      className="flex h-screen w-56 shrink-0 flex-col"
      style={{ background: "var(--bg-1)", borderRight: "1px solid var(--border-1)" }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-5"
        style={{ borderBottom: "1px solid var(--border-1)" }}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "var(--btn-bg)", boxShadow: "var(--shadow-btn)" }}
        >
          <Shield className="h-3.5 w-3.5" style={{ color: "var(--btn-text)" }} />
        </div>
        <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-0)" }}>
          PR Guardian
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150"
              style={{
                background: active ? "var(--border-0)" : "transparent",
                color: active ? "var(--text-0)" : "var(--text-2)",
                fontWeight: active ? 500 : 400,
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "var(--border-1)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <Icon
                className="h-4 w-4 shrink-0"
                style={{ color: active ? "var(--text-0)" : "var(--text-3)" }}
              />
              {label}
              {active && (
                <span
                  className="ml-auto h-1 w-1 rounded-full"
                  style={{ background: "var(--text-0)", opacity: 0.4 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: theme toggle + sign out */}
      <div
        className="flex flex-col gap-0.5 p-3"
        style={{ borderTop: "1px solid var(--border-1)" }}
      >
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150"
          style={{ color: "var(--text-2)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--border-1)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-0)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--text-2)";
          }}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 shrink-0" />
          ) : (
            <Moon className="h-4 w-4 shrink-0" />
          )}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>

        {/* Sign out */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150"
          style={{ color: "var(--text-2)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--border-1)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-0)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--text-2)";
          }}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-0)" }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-10">{children}</div>
      </main>
    </div>
  );
}
