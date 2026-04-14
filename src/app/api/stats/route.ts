import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Run all queries in parallel
    const [allReviews, recentReviews, repoStats, dailyCounts] = await Promise.all([
      // All-time totals
      prisma.review.findMany({
        where: { pullRequest: { repo: { userId: user.id } } },
        select: { decision: true, compositeScore: true, durationMs: true, issues: true },
      }),

      // Last 30 days for trend
      prisma.review.findMany({
        where: {
          pullRequest: { repo: { userId: user.id } },
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { compositeScore: true, decision: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),

      // Per-repo stats
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

      // Daily counts (raw SQL for GROUP BY date)
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

    // Decision breakdown
    const decisionBreakdown = {
      APPROVE:            allReviews.filter((r) => r.decision === "APPROVE").length,
      APPROVE_WITH_NOTES: allReviews.filter((r) => r.decision === "APPROVE_WITH_NOTES").length,
      BLOCK:              allReviews.filter((r) => r.decision === "BLOCK").length,
    };

    // Average score + duration
    const avgScore = allReviews.length
      ? Math.round(allReviews.reduce((s, r) => s + r.compositeScore, 0) / allReviews.length)
      : 0;

    const avgDurationMs = allReviews.length
      ? Math.round(allReviews.reduce((s, r) => s + r.durationMs, 0) / allReviews.length)
      : 0;

    // Score distribution buckets
    const scoreDistribution = {
      "90-100": allReviews.filter((r) => r.compositeScore >= 90).length,
      "70-89":  allReviews.filter((r) => r.compositeScore >= 70 && r.compositeScore < 90).length,
      "50-69":  allReviews.filter((r) => r.compositeScore >= 50 && r.compositeScore < 70).length,
      "<50":    allReviews.filter((r) => r.compositeScore < 50).length,
    };

    // Top issue categories from last 100 reviews
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
      .slice(0, 6)
      .map(([category, count]) => ({ category, count }));

    // Build last-30-days chart data (fill missing dates with 0)
    const dailyMap = new Map(dailyCounts.map((d) => [d.date, Number(d.count)]));
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      return { date: key, count: dailyMap.get(key) ?? 0 };
    });

    // Score trend — group recent reviews into buckets of 5
    const scoreTrend = recentReviews.map((r) => ({
      score: r.compositeScore,
      date: r.createdAt.toISOString().slice(0, 10),
    }));

    // Per-repo table
    const repoTable = repoStats
      .map((repo) => {
        const reviews = repo.pullRequests.flatMap((pr) => pr.reviews);
        return {
          fullName: repo.fullName,
          totalReviews: reviews.length,
          avgScore: reviews.length
            ? Math.round(reviews.reduce((s, r) => s + r.compositeScore, 0) / reviews.length)
            : 0,
          blocked: reviews.filter((r) => r.decision === "BLOCK").length,
          blockRate: reviews.length
            ? Math.round((reviews.filter((r) => r.decision === "BLOCK").length / reviews.length) * 100)
            : 0,
        };
      })
      .filter((r) => r.totalReviews > 0)
      .sort((a, b) => b.totalReviews - a.totalReviews);

    return NextResponse.json({
      success: true,
      data: {
        totalReviews: allReviews.length,
        avgScore,
        avgDurationMs,
        decisionBreakdown,
        scoreDistribution,
        topCategories,
        last30Days,
        scoreTrend,
        repoTable,
      },
    });
  } catch (error) {
    logger.error("Failed to fetch stats", {
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, error: "Failed to fetch stats" }, { status: 500 });
  }
}
