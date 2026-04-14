import { signIn } from "@/lib/auth";
import { Shield } from "lucide-react";

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

      <div className="relative w-full max-w-[360px] px-5">

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
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/dashboard" });
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

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "var(--border-0)" }} />
            <span className="text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
              What you get
            </span>
            <div className="h-px flex-1" style={{ background: "var(--border-0)" }} />
          </div>

          <ul className="space-y-3">
            {[
              "Automatic review on every PR opened",
              "Security vulnerabilities & bug detection",
              "Code quality score with actionable feedback",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{ border: "1px solid var(--border-0)" }}
                >
                  <div
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--text-2)" }}
                  />
                </div>
                <span className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-center text-[11px]" style={{ color: "var(--text-3)" }}>
          Requires repo read/write access for webhook setup.
        </p>
      </div>
    </div>
  );
}
