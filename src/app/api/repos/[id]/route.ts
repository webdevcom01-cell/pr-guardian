import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteWebhook } from "@/lib/github";

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
    } catch {
      // Webhook may already be gone — continue with DB cleanup
    }
  }

  await prisma.repository.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
