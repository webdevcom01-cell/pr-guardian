"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, LayoutDashboard, GitBranch, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/repos", label: "Repositories", icon: GitBranch },
];

function Sidebar() {
  const path = usePathname();
  return (
    <aside
      className="flex h-screen w-56 shrink-0 flex-col"
      style={{
        background: "#0a0a0a",
        borderRight: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
        >
          <Shield className="h-3.5 w-3.5 text-black" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-white">
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
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150",
                active
                  ? "bg-white/10 text-white font-medium"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active ? "text-white" : "text-zinc-600 group-hover:text-zinc-400"
                )}
              />
              {label}
              {active && (
                <span className="ml-auto h-1 w-1 rounded-full bg-white opacity-60" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div
        className="p-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-600 transition-all duration-150 hover:bg-white/5 hover:text-zinc-300"
        >
          <LogOut className="h-4 w-4 shrink-0 group-hover:text-zinc-400" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#000" }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-10">{children}</div>
      </main>
    </div>
  );
}
