import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const review = await prisma.review.findUnique({
    where: { id },
    include: {
      pullRequest: {
        include: { repo: { select: { fullName: true, userId: true } } },
      },
    },
  });

  if (!review || review.pullRequest.repo.userId !== user.id) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: review });
}
