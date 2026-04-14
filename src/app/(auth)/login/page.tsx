import { signIn } from "@/lib/auth";
import { Shield } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-black">

      {/* Very subtle radial glow in center */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 60% 40% at 50% 45%, rgba(255,255,255,0.03) 0%, transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-[360px] px-5">

        {/* Logo mark */}
        <div className="mb-10 flex flex-col items-center gap-5">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white"
            style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.8)" }}
          >
            <Shield className="h-7 w-7 text-black" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight text-white">
              PR Guardian
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
              AI code review on every pull request
            </p>
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-7"
          style={{
            background: "linear-gradient(145deg, #141414, #0f0f0f)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 4px 8px rgba(0,0,0,0.5), 0 16px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/dashboard" });
            }}
          >
            <button
              type="submit"
              className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-white px-4 py-3 text-sm font-medium text-black transition-all duration-200 hover:bg-zinc-100 active:scale-[0.98]"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)" }}
            >
              <svg className="h-4.5 w-4.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18 }}>
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>
          </form>

          <div className="mt-6 space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">What you get</p>
            {[
              "Automatic review on every PR opened",
              "Security vulnerabilities & bug detection",
              "Code quality score with actionable feedback",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-zinc-700 flex items-center justify-center">
                  <div className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                </div>
                <span className="text-xs leading-relaxed text-zinc-400">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-zinc-700">
          Requires repo read/write access for webhook setup.
        </p>
      </div>
    </div>
  );
}
