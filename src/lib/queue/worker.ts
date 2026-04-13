import { Worker, type Job } from "bullmq";
import type { JobData, ReviewJobData } from "./index";
import { logger } from "@/lib/logger";

const QUEUE_NAME = "pr-guardian";

/** Per-job timeout: 5 minutes max for AI review */
const JOB_TIMEOUT_MS = 5 * 60 * 1000;

function getConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required");
  return { url };
}

async function processReviewJob(job: Job<ReviewJobData>): Promise<unknown> {
  logger.info("Processing review job", {
    jobId: job.id,
    repoId: job.data.repoId,
    prNumber: job.data.prNumber,
    pullRequestId: job.data.pullRequestId,
  });

  const startedAt = Date.now();

  // Timeout guard: abort if job takes too long
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), JOB_TIMEOUT_MS);

  try {
    const { runReview } = await import("@/lib/reviewer");

    // Wrap in a race to enforce timeout
    const reviewId = await Promise.race([
      runReview({
        repoId: job.data.repoId,
        pullRequestId: job.data.pullRequestId,
        owner: job.data.owner,
        repo: job.data.repo,
        prNumber: job.data.prNumber,
        headSha: job.data.headSha,
        userToken: job.data.userToken,
      }),
      new Promise<never>((_resolve, reject) => {
        ac.signal.addEventListener("abort", () =>
          reject(new Error(`Review job timed out after ${JOB_TIMEOUT_MS / 1000}s`))
        );
      }),
    ]);

    const durationMs = Date.now() - startedAt;
    logger.info("Review completed", { jobId: job.id, reviewId, durationMs });

    return { reviewId };
  } finally {
    clearTimeout(timeoutId);
  }
}

const worker = new Worker<JobData>(
  QUEUE_NAME,
  async (job) => {
    switch (job.data.type) {
      case "review.run":
        return processReviewJob(job as Job<ReviewJobData>);
      default:
        logger.warn("Unknown job type", { jobId: job.id, type: (job.data as JobData).type });
    }
  },
  {
    connection: getConnection(),
    concurrency: 3,
  },
);

worker.on("completed", (job) => {
  logger.info("Job completed", { jobId: job.id });
});

worker.on("failed", (job, err) => {
  logger.error("Job failed", {
    jobId: job?.id,
    error: err.message,
    attempt: job?.attemptsMade,
    maxAttempts: job?.opts?.attempts,
  });
});

// Graceful shutdown
function shutdown() {
  logger.info("Worker shutting down...");
  worker.close().then(() => {
    logger.info("Worker stopped");
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

logger.info("PR Guardian worker started", { concurrency: 3 });
