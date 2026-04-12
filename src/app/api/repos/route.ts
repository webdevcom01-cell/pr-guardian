import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registerWebhook, generateWebhookSecret } from "@/lib/github";

// GET /api/repos — list connected repos
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const repos = await prisma.repository.findMany({
    where: { userId: user.id },
    include: {
      _count: { select: { pullRequests: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: repos });
}

const ConnectSchema = z.object({
  fullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "Must be owner/repo format"),
  githubId: z.number().int().positive(),
  description: z.string().optional(),
});

// POST /api/repos — connect a repo
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body: unknown = await req.json();
  const parsed = ConnectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }

  const { fullName, githubId, description } = parsed.data;
  const [owner, repo] = fullName.split("/");
  const webhookSecret = generateWebhookSecret();
  const webhookUrl = `${process.env.APP_URL}/api/webhooks/github`;

  let webhookId: number | undefined;
  try {
    webhookId = await registerWebhook(owner, repo, webhookUrl, webhookSecret, user.githubToken);
  } catch {
    return NextResponse.json(
      { error: "Failed to register webhook. Check repo permissions." },
      { status: 400 },
    );
  }

  const repository = await prisma.repository.upsert({
    where: { githubId },
    update: { webhookId, webhookSecret, isActive: true },
    create: {
      userId: user.id,
      githubId,
      fullName,
      description,
      webhookId,
      webhookSecret,
    },
  });

  return NextResponse.json({ success: true, data: repository }, { status: 201 });
}
