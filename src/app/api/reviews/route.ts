import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/reviews — list recent reviews for the current user
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const reviews = await prisma.review.findMany({
    where: {
      pullRequest: { repo: { userId: user.id } },
    },
    include: {
      pullRequest: {
        select: {
          prNumber: true,
          title: true,
          author: true,
          prUrl: true,
          headBranch: true,
          repo: { select: { fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  return NextResponse.json({ success: true, data: reviews });
}
