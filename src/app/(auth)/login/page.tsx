import { signIn } from "@/lib/auth";
import { Shield, Lock, Webhook, GitPullRequest, User } from "lucide-react";

const PUBLIC_PERMISSIONS = [
  { icon: GitPullRequest, label: "public_repo",       desc: "Post review comments on public repositories" },
  { icon: Webhook,        label: "admin:repo_hook",   desc: "Create and remove webhooks" },
  { icon: Shield,         label: "repo:status",       desc: "Post ✅/❌ commit status checks on PRs" },
  { icon: User,           label: "read:user + email", desc: "Read your GitHub profile and email" },
];

export default function LoginPage() {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center"
      style={{ background: "var(--bg-0)" }}
    >
      {/* Subtle center radial */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 55% 35% at 50% 45%, var(--border-0) 0%, transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-[380px] px-5">

        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-5">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "var(--btn-bg)", boxShadow: "var(--shadow-raised)" }}
          >
            <Shield className="h-7 w-7" style={{ color: "var(--btn-text)" }} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-0)" }}>
              PR Guardian
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
              AI code review on every pull request
            </p>
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-7"
          style={{ background: "var(--bg-2)", boxShadow: "var(--shadow-raised)" }}
        >
          {/* Primary sign-in — public repos */}
          <form
            action={async () => {
              "use server";
              await signIn(
                "github",
                { redirectTo: "/dashboard" },
                { scope: "read:user user:email public_repo admin:repo_hook repo:status" },
              );
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 active:scale-[0.98]"
              style={{
                background: "var(--btn-bg)",
                color: "var(--btn-text)",
                boxShadow: "var(--shadow-btn)",
              }}
            >
              <svg className="flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" style={{ width: 17, height: 17 }}>
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>
          </form>

          {/* Private repos option */}
          <form
            className="mt-2"
            action={async () => {
              "use server";
              await signIn(
                "github",
                { redirectTo: "/dashboard" },
                { scope: "read:user user:email repo" },
              );
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all duration-200"
              style={{
                background: "transparent",
                color: "var(--text-2)",
                border: "1px solid var(--border-0)",
              }}
            >
              <Lock className="h-3.5 w-3.5" style={{ color: "var(--text-3)" }} />
              I need access to private repositories
            </button>
          </form>

          {/* Permissions section */}
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1" style={{ background: "var(--border-0)" }} />
              <span className="text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                Permissions requested
              </span>
              <div className="h-px flex-1" style={{ background: "var(--border-0)" }} />
            </div>

            <ul className="space-y-3">
              {PUBLIC_PERMISSIONS.map(({ icon: Icon, label, desc }) => (
                <li key={label} className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                    style={{ background: "var(--bg-0)", border: "1px solid var(--border-0)" }}
                  >
                    <Icon className="h-3 w-3" style={{ color: "var(--text-3)" }} />
                  </div>
                  <div>
                    <code
                      className="text-[11px] font-mono"
                      style={{ color: "var(--text-1)" }}
                    >
                      {label}
                    </code>
                    <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>
                      {desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>
              Private repos require{" "}
              <code className="font-mono" style={{ color: "var(--text-2)" }}>repo</code>
              {" "}scope (full access). Use the secondary button above.
              We never store your code — only review metadata.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
