import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOctokit } from "@/lib/github";
import { logger } from "@/lib/logger";

/**
 * GET /api/repos/github — Fetch the user's GitHub repos (server-side).
 * Token stays on the server, never exposed to the browser.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { githubToken: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const octokit = getOctokit(user.githubToken);
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: "updated",
      direction: "desc",
    });

    const simplified = repos.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      description: r.description,
      private: r.private,
    }));

    return NextResponse.json({ success: true, data: simplified });
  } catch (error) {
    logger.error("Failed to fetch GitHub repos", {
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to fetch GitHub repositories" },
      { status: 500 },
    );
  }
}
