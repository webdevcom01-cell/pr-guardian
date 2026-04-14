import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, decisionColor, decisionLabel, scoreColor } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GitPullRequest, ShieldCheck, ShieldAlert, TrendingUp, Clock } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");

  const [repoCount, reviews] = await Promise.all([
    prisma.repository.count({ where: { userId: user.id, isActive: true } }),
    prisma.review.findMany({
      where: { pullRequest: { repo: { userId: user.id } } },
      include: {
        pullRequest: {
          select: { prNumber: true, title: true, prUrl: true, repo: { select: { fullName: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const approved = reviews.filter((r) => r.decision === "APPROVE").length;
  const blocked  = reviews.filter((r) => r.decision === "BLOCK").length;
  const avgScore = reviews.length
    ? Math.round(reviews.reduce((s, r) => s + r.compositeScore, 0) / reviews.length)
    : 0;

  const stats = [
    { label: "Repos",    value: repoCount,       icon: GitPullRequest },
    { label: "Reviews",  value: reviews.length,  icon: TrendingUp     },
    { label: "Approved", value: approved,         icon: ShieldCheck    },
    { label: "Blocked",  value: blocked,          icon: ShieldAlert    },
  ];

  return (
    <div className="space-y-10">

      {/* Header */}
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "var(--text-0)" }}
        >
          {user.name ? `Good to see you, ${user.name.split(" ")[0]}.` : "Dashboard"}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-3)" }}>
          {reviews.length === 0
            ? "Connect a repository to start reviewing pull requests."
            : `${reviews.length} review${reviews.length !== 1 ? "s" : ""} across ${repoCount} repo${repoCount !== 1 ? "s" : ""}.`}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl p-5"
            style={{ background: "var(--bg-2)", boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] font-medium uppercase tracking-widest"
                style={{ color: "var(--text-3)" }}
              >
                {label}
              </span>
              <Icon className="h-3.5 w-3.5" style={{ color: "var(--text-3)" }} />
            </div>
            <p
              className="mt-3 font-tabular text-3xl font-semibold tracking-tight"
              style={{ color: "var(--text-0)" }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Avg score */}
      {reviews.length > 0 && (
        <div
          className="flex items-center justify-between rounded-xl p-6"
          style={{ background: "var(--bg-2)", boxShadow: "var(--shadow-card)" }}
        >
          <div>
            <p
              className="text-[11px] font-medium uppercase tracking-widest"
              style={{ color: "var(--text-3)" }}
            >
              Average Quality Score
            </p>
            <p className="mt-1.5 font-tabular text-5xl font-semibold tracking-tighter" style={{ color: "var(--text-0)" }}>
              {avgScore}
              <span className="ml-1 text-xl font-normal" style={{ color: "var(--text-3)" }}>/100</span>
            </p>
          </div>
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold"
            style={{ border: "1px solid var(--border-0)", color: "var(--text-2)" }}
          >
            {avgScore >= 80 ? "✓" : avgScore >= 60 ? "~" : "!"}
          </div>
        </div>
      )}

      {/* Recent reviews */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="text-[11px] font-medium uppercase tracking-widest"
            style={{ color: "var(--text-3)" }}
          >
            Recent Reviews
          </h2>
          {reviews.length > 0 && (
            <Link
              href="/dashboard/repos"
              className="text-xs transition"
              style={{ color: "var(--text-3)" }}
            >
              View repos →
            </Link>
          )}
        </div>

        {reviews.length === 0 ? (
          <div
            className="rounded-xl p-12 text-center"
            style={{ background: "var(--bg-2)", boxShadow: "var(--shadow-card)" }}
          >
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ border: "1px solid var(--border-0)" }}
            >
              <GitPullRequest className="h-5 w-5" style={{ color: "var(--text-3)" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>No reviews yet</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
              Connect a repo and open a pull request to get started.
            </p>
            <Link
              href="/dashboard/repos"
              className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition hover:opacity-90"
              style={{ background: "var(--btn-bg)", color: "var(--btn-text)", boxShadow: "var(--shadow-btn)" }}
            >
              Connect repository
            </Link>
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-xl"
            style={{ background: "var(--bg-2)", boxShadow: "var(--shadow-card)" }}
          >
            {reviews.map((review, i) => (
              <div
                key={review.id}
                className="flex items-center gap-4 px-5 py-4 transition-colors"
                style={{
                  borderBottom: i < reviews.length - 1 ? "1px solid var(--border-1)" : "none",
                }}
              >
                <div className="w-10 shrink-0 text-center">
                  <span className={`font-tabular text-sm font-semibold ${scoreColor(review.compositeScore)}`}>
                    {review.compositeScore}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                      {review.pullRequest.repo.fullName}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-3)", opacity: 0.5 }}>
                      #{review.pullRequest.prNumber}
                    </span>
                  </div>
                  <a
                    href={review.pullRequest.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 block truncate text-sm transition hover:opacity-100"
                    style={{ color: "var(--text-1)", opacity: 0.8 }}
                  >
                    {review.pullRequest.title}
                  </a>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${decisionColor(review.decision)}`}>
                  {decisionLabel(review.decision)}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                  <Clock className="h-3 w-3" />
                  {formatDate(review.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
