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
    <aside className="flex h-screen w-56 flex-col border-r border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
          <Shield className="h-4 w-4 text-white" />
        </div>
        <span className="font-semibold text-zinc-100">PR Guardian</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
              path === href
                ? "bg-violet-600/20 text-violet-400"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-100"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </aside>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
