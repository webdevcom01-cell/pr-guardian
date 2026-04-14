import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/github";
import { addReviewJob } from "@/lib/queue";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const event = req.headers.get("x-github-event") ?? "";
  const deliveryId = req.headers.get("x-github-delivery") ?? "unknown";
  const rawBody = await req.text();

  if (event !== "pull_request") {
    return NextResponse.json({ ignored: true, event });
  }

  let payload: {
    action: string;
    repository: { id: number; full_name: string };
    pull_request: {
      number: number;
      title: string;
      user: { login: string };
      head: { sha: string; ref: string };
      base: { ref: string };
      html_url: string;
    };
  };

  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, repository, pull_request: pr } = payload;
  if (!["opened", "synchronize", "reopened"].includes(action)) {
    return NextResponse.json({ ignored: true, action });
  }

  // Find the connected repo
  const repo = await prisma.repository.findUnique({
    where: { githubId: repository.id },
    include: { user: { select: { githubToken: true } } },
  });

  if (!repo || !repo.isActive) {
    return NextResponse.json({ ignored: true, reason: "repo not connected" });
  }

  // Verify HMAC signature
  if (!verifyWebhookSignature(rawBody, signature, repo.webhookSecret)) {
    logger.warn("Webhook signature verification failed", {
      deliveryId,
      repoFullName: repository.full_name,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const [owner, repoName] = repository.full_name.split("/");

  // Rate limit: max 10 webhook events per minute per repository
  const redis = getRedis();
  if (redis) {
    const rateLimitKey = `webhook:ratelimit:${repository.full_name}`;
    try {
      const count = await redis.incr(rateLimitKey);
      if (count === 1) {
        await redis.expire(rateLimitKey, 60);
      }
      if (count > 10) {
        logger.warn("Webhook rate limit exceeded", { owner, repo: repoName, count });
        return NextResponse.json({ success: false, error: "Rate limit exceeded" }, { status: 429 });
      }
    } catch {
      // Redis failure is non-fatal — continue processing
    }
  }

  // Upsert PullRequest record
  const pullRequest = await prisma.pullRequest.upsert({
    where: {
      repoId_prNumber_headSha: {
        repoId: repo.id,
        prNumber: pr.number,
        headSha: pr.head.sha,
      },
    },
    update: {},
    create: {
      repoId: repo.id,
      prNumber: pr.number,
      title: pr.title,
      author: pr.user.login,
      headSha: pr.head.sha,
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      prUrl: pr.html_url,
    },
  });

  // Race condition guard: check if a review already exists for this PR+SHA
  const existingReview = await prisma.review.findFirst({
    where: { pullRequestId: pullRequest.id },
    select: { id: true },
  });

  if (existingReview) {
    logger.info("Review already exists, skipping duplicate webhook", {
      deliveryId,
      pullRequestId: pullRequest.id,
      existingReviewId: existingReview.id,
    });
    return NextResponse.json({
      ignored: true,
      reason: "review already exists",
      reviewId: existingReview.id,
    });
  }

  // Enqueue review job
  try {
    await addReviewJob({
      repoId: repo.id,
      pullRequestId: pullRequest.id,
      owner,
      repo: repoName,
      prNumber: pr.number,
      headSha: pr.head.sha,
      userToken: repo.user.githubToken,
    });
  } catch (error) {
    logger.error("Failed to enqueue review job", {
      deliveryId,
      pullRequestId: pullRequest.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to enqueue review" }, { status: 500 });
  }

  logger.info("Webhook processed, review enqueued", {
    deliveryId,
    pullRequestId: pullRequest.id,
    repoFullName: repository.full_name,
    prNumber: pr.number,
    action,
  });

  return NextResponse.json({ queued: true, pullRequestId: pullRequest.id });
}
