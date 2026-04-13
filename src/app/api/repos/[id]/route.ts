import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteWebhook } from "@/lib/github";
import { logger } from "@/lib/logger";

// DELETE /api/repos/[id] — disconnect a repo
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const repo = await prisma.repository.findUnique({ where: { id } });
    if (!repo || repo.userId !== user.id) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Try to remove GitHub webhook (best-effort)
    if (repo.webhookId) {
      const [owner, repoName] = repo.fullName.split("/");
      try {
        await deleteWebhook(owner, repoName, repo.webhookId, user.githubToken);
      } catch (err) {
        logger.warn("Webhook deletion failed (best-effort)", {
          repoId: id,
          webhookId: repo.webhookId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await prisma.repository.delete({ where: { id } });

    logger.info("Repository disconnected", {
      userId: user.id,
      repoId: id,
      fullName: repo.fullName,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to disconnect repo", {
      userId: session.user.id,
      repoId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to disconnect repository" }, { status: 500 });
  }
}
