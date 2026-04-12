import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, decisionColor, decisionLabel, scoreColor } from "@/lib/utils";
import Link from "next/link";
import { GitPullRequest, ShieldCheck, ShieldAlert, Clock } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  const user = await prisma.user.findUnique({ where: { id: session!.user.id } });
  if (!user) return null;

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
  const blocked = reviews.filter((r) => r.decision === "BLOCK").length;
  const avgScore = reviews.length
    ? Math.round(reviews.reduce((s, r) => s + r.compositeScore, 0) / reviews.length)
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Welcome back{user.name ? `, ${user.name}` : ""}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Connected Repos", value: repoCount, icon: GitPullRequest, color: "text-violet-400" },
          { label: "Total Reviews", value: reviews.length, icon: ShieldCheck, color: "text-blue-400" },
          { label: "Approved", value: approved, icon: ShieldCheck, color: "text-emerald-400" },
          { label: "Blocked", value: blocked, icon: ShieldAlert, color: "text-red-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">{label}</p>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="mt-2 text-3xl font-bold text-zinc-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Avg score */}
      {reviews.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-sm text-zinc-400">Average Code Quality Score</p>
          <p className={`mt-1 text-4xl font-bold ${scoreColor(avgScore)}`}>{avgScore}<span className="text-xl text-zinc-500">/100</span></p>
        </div>
      )}

      {/* Recent reviews */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100">Recent Reviews</h2>
        </div>
        {reviews.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center">
            <p className="text-zinc-400">No reviews yet.</p>
            <Link href="/dashboard/repos" className="mt-2 inline-block text-sm text-violet-400 hover:underline">
              Connect a repository →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {reviews.map((review) => (
              <div key={review.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{review.pullRequest.repo.fullName}</span>
                    <span className="text-xs text-zinc-600">#{review.pullRequest.prNumber}</span>
                  </div>
                  <a href={review.pullRequest.prUrl} target="_blank" rel="noopener noreferrer"
                    className="truncate text-sm font-medium text-zinc-100 hover:text-violet-400">
                    {review.pullRequest.title}
                  </a>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${decisionColor(review.decision)}`}>
                    {decisionLabel(review.decision)}
                  </span>
                  <span className={`text-sm font-bold ${scoreColor(review.compositeScore)}`}>
                    {review.compositeScore}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    <Clock className="h-3 w-3" /> {formatDate(review.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
