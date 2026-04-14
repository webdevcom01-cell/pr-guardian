import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { BarChart2, ShieldCheck, ShieldAlert, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import type { Prisma } from "@/generated/prisma";

// ─── helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 80) return "var(--text-0)";
  if (s >= 60) return "var(--text-2)";
  return "#ef4444";
}

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function MetricsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [allReviews, repoStats, dailyCounts] = await Promise.all([
    prisma.review.findMany({
      where: { pullRequest: { repo: { userId: user.id } } },
      select: { decision: true, compositeScore: true, durationMs: true, issues: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),

    prisma.repository.findMany({
      where: { userId: user.id, isActive: true },
      select: {
        fullName: true,
        pullRequests: {
          select: {
            reviews: {
              select: { decision: true, compositeScore: true },
              orderBy: { createdAt: "desc" },
              take: 50,
            },
          },
        },
      },
    }),

    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE(r."createdAt") as date, COUNT(*) as count
      FROM "Review" r
      JOIN "PullRequest" pr ON r."pullRequestId" = pr.id
      JOIN "Repository" repo ON pr."repoId" = repo.id
      WHERE repo."userId" = ${user.id}
        AND r."createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE(r."createdAt")
      ORDER BY date ASC
    `,
  ]);

  if (allReviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <BarChart2 className="mb-4 h-10 w-10" style={{ color: "var(--text-3)" }} />
        <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>No data yet</p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
          Metrics appear once reviews start coming in.
        </p>
      </div>
    );
  }

  // ── Aggregate stats ──────────────────────────────────────────────────────────
  const approved     = allReviews.filter((r) => r.decision === "APPROVE").length;
  const withNotes    = allReviews.filter((r) => r.decision === "APPROVE_WITH_NOTES").length;
  const blocked      = allReviews.filter((r) => r.decision === "BLOCK").length;
  const total        = allReviews.length;
  const avgScore     = Math.round(allReviews.reduce((s, r) => s + r.compositeScore, 0) / total);
  const avgDuration  = Math.round(allReviews.reduce((s, r) => s + r.durationMs, 0) / total);
  const blockRate    = Math.round((blocked / total) * 100);

  // ── Score distribution ───────────────────────────────────────────────────────
  const scoreBuckets = [
    { label: "90–100", color: "#22c55e", count: allReviews.filter((r) => r.compositeScore >= 90).length },
    { label: "70–89",  color: "#84cc16", count: allReviews.filter((r) => r.compositeScore >= 70 && r.compositeScore < 90).length },
    { label: "50–69",  color: "#f59e0b", count: allReviews.filter((r) => r.compositeScore >= 50 && r.compositeScore < 70).length },
    { label: "< 50",   color: "#ef4444", count: allReviews.filter((r) => r.compositeScore < 50).length },
  ];
  const maxBucket = Math.max(...scoreBuckets.map((b) => b.count), 1);

  // ── Issue categories ─────────────────────────────────────────────────────────
  const categoryCount: Record<string, number> = {};
  for (const review of allReviews.slice(-100)) {
    const issues = review.issues as Prisma.JsonValue;
    if (!Array.isArray(issues)) continue;
    for (const issue of issues) {
      if (
        typeof issue === "object" &&
        issue !== null &&
        typeof (issue as Record<string, unknown>).category === "string"
      ) {
        const cat = (issue as Record<string, unknown>).category as string;
        categoryCount[cat] = (categoryCount[cat] ?? 0) + 1;
      }
    }
  }
  const topCategories = Object.entries(categoryCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);
  const maxCategory = Math.max(...topCategories.map(([, c]) => c), 1);

  // ── Last 30 days bar chart ───────────────────────────────────────────────────
  const dailyMap = new Map(dailyCounts.map((d) => [d.date, Number(d.count)]));
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(thirtyDaysAgo);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    return { date: key, count: dailyMap.get(key) ?? 0 };
  });
  const maxDay = Math.max(...last30Days.map((d) => d.count), 1);

  // ── Per-repo table ───────────────────────────────────────────────────────────
  const repoTable = repoStats
    .map((repo) => {
      const reviews = repo.pullRequests.flatMap((pr) => pr.reviews);
      return {
        fullName:     repo.fullName,
        totalReviews: reviews.length,
        avgScore:     reviews.length
          ? Math.round(reviews.reduce((s, r) => s + r.compositeScore, 0) / reviews.length)
          : 0,
        blocked:      reviews.filter((r) => r.decision === "BLOCK").length,
        blockRate:    reviews.length
          ? Math.round((reviews.filter((r) => r.decision === "BLOCK").length / reviews.length) * 100)
          : 0,
      };
    })
    .filter((r) => r.totalReviews > 0)
    .sort((a, b) => b.totalReviews - a.totalReviews);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-10">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-0)" }}>
          Metrics
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-3)" }}>
          {total} review{total !== 1 ? "s" : ""} across all repositories.
        </p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Reviews",  value: total,              icon: BarChart2,   sub: "all time" },
          { label: "Avg Score",      value: `${avgScore}/100`,  icon: TrendingUp,  sub: "composite" },
          { label: "Block Rate",     value: `${blockRate}%`,    icon: ShieldAlert, sub: `${blocked} blocked` },
          { label: "Avg Review Time",value: fmtDuration(avgDuration), icon: Clock, sub: "per review" },
        ].map(({ label, value, icon: Icon, sub }) => (
          <div
            key={label}
            className="rounded-xl p-5"
            style={{ background: "var(--bg-2)", boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                {label}
              </span>
              <Icon className="h-3.5 w-3.5" style={{ color: "var(--text-3)" }} />
            </div>
            <p className="mt-3 font-tabular text-2xl font-semibold tracking-tight" style={{ color: "var(--text-0)" }}>
              {value}
            </p>
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Activity + Decisions row */}
      <div className="grid grid-cols-3 gap-4">

        {/* 30-day activity bar chart */}
        <div
          className="col-span-2 rounded-xl p-6"
          style={{ background: "var(--bg-2)", boxShadow: "var(--shadow-card)" }}
        >
          <p className="mb-5 text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
            Activity — last 30 days
          </p>
          <div className="flex items-end gap-[3px]" style={{ height: 80 }}>
            {last30Days.map((day) => (
              <div
                key={day.date}
                className="group relative flex-1"
                style={{ height: "100%", display: "flex", alignItems: "flex-end" }}
                title={`${fmtDate(day.date)}: ${day.count} review${day.count !== 1 ? "s" : ""}`}
              >
                <div
                  className="w-full rounded-sm transition-opacity"
                  style={{
                    height: day.count === 0 ? 2 : `${Math.max(8, (day.count / maxDay) * 100)}%`,
                    background: day.count === 0 ? "var(--border-0)" : "var(--btn-bg)",
                    opacity: day.count === 0 ? 0.4 : 1,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between">
            <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
              {fmtDate(last30Days[0].date)}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
              {fmtDate(last30Days[last30Days.length - 1].date)}
            </span>
          </div>
        </div>

        {/* Decision breakdown */}
        <div
          className="rounded-xl p-6"
          style={{ background: "var(--bg-2)", boxShadow: "var(--shadow-card)" }}
        >
          <p className="mb-5 text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
            Decisions
          </p>
          <div className="space-y-3">
            {[
              { label: "Approved",       count: approved,  pct: Math.round((approved / total) * 100),  icon: ShieldCheck,  color: "#22c55e" },
              { label: "With Notes",     count: withNotes, pct: Math.round((withNotes / total) * 100), icon: AlertTriangle, color: "#f59e0b" },
              { label: "Blocked",        count: blocked,   pct: Math.round((blocked / total) * 100),   icon: ShieldAlert,  color: "#ef4444" },
            ].map(({ label, count, pct, color }) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--text-2)" }}>{label}</span>
                  <span className="font-tabular text-xs font-medium" style={{ color: "var(--text-1)" }}>
                    {count} <span style={{ color: "var(--text-3)" }}>({pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border-0)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Score distribution + Issue categories row */}
      <div className="grid grid-cols-2 gap-4">

        {/* Score distribution */}
        <div
          className="rounded-xl p-6"
          style={{ background: "var(--bg-2)", boxShadow: "var(--shadow-card)" }}
        >
          <p className="mb-5 text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
            Score Distribution
          </p>
          <div className="space-y-3">
            {scoreBuckets.map(({ label, color, count }) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-tabular text-xs" style={{ color: "var(--text-2)" }}>{label}</span>
                  <span className="font-tabular text-xs" style={{ color: "var(--text-3)" }}>{count}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--border-0)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(count / maxBucket) * 100}%`, background: color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Issue categories */}
        <div
          className="rounded-xl p-6"
          style={{ background: "var(--bg-2)", boxShadow: "var(--shadow-card)" }}
        >
          <p className="mb-5 text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
            Top Issue Categories
          </p>
          {topCategories.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>No issues found in recent reviews.</p>
          ) : (
            <div className="space-y-3">
              {topCategories.map(([category, count]) => (
                <div key={category}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs capitalize" style={{ color: "var(--text-2)" }}>{category}</span>
                    <span className="font-tabular text-xs" style={{ color: "var(--text-3)" }}>{count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--border-0)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(count / maxCategory) * 100}%`, background: "var(--btn-bg)" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Per-repo table */}
      {repoTable.length > 0 && (
        <div>
          <p className="mb-4 text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
            By Repository
          </p>
          <div
            className="overflow-hidden rounded-xl"
            style={{ background: "var(--bg-2)", boxShadow: "var(--shadow-card)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-1)" }}>
                  {["Repository", "Reviews", "Avg Score", "Blocked", "Block Rate"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-widest"
                      style={{ color: "var(--text-3)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {repoTable.map((repo, i) => (
                  <tr
                    key={repo.fullName}
                    style={{ borderBottom: i < repoTable.length - 1 ? "1px solid var(--border-1)" : "none" }}
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
                        {repo.fullName}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-tabular text-sm" style={{ color: "var(--text-2)" }}>
                      {repo.totalReviews}
                    </td>
                    <td className="px-5 py-3.5 font-tabular text-sm font-semibold" style={{ color: scoreColor(repo.avgScore) }}>
                      {repo.avgScore}
                    </td>
                    <td className="px-5 py-3.5 font-tabular text-sm" style={{ color: repo.blocked > 0 ? "#ef4444" : "var(--text-3)" }}>
                      {repo.blocked}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "var(--border-0)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${repo.blockRate}%`,
                              background: repo.blockRate > 20 ? "#ef4444" : repo.blockRate > 10 ? "#f59e0b" : "#22c55e",
                            }}
                          />
                        </div>
                        <span className="font-tabular text-xs" style={{ color: "var(--text-3)" }}>
                          {repo.blockRate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
