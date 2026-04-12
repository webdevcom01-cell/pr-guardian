import { Worker, type Job } from "bullmq";
import type { JobData, ReviewJobData } from "./index";

const QUEUE_NAME = "pr-guardian";

function getConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required");
  return { url };
}

async function processReviewJob(job: Job<ReviewJobData>): Promise<unknown> {
  console.log(`[worker] Processing review job ${job.id}`, job.data);
  const { runReview } = await import("@/lib/reviewer");
  const reviewId = await runReview({
    repoId: job.data.repoId,
    pullRequestId: job.data.pullRequestId,
    owner: job.data.owner,
    repo: job.data.repo,
    prNumber: job.data.prNumber,
    headSha: job.data.headSha,
    userToken: job.data.userToken,
  });
  console.log(`[worker] Review completed: ${reviewId}`);
  return { reviewId };
}

const worker = new Worker<JobData>(
  QUEUE_NAME,
  async (job) => {
    switch (job.data.type) {
      case "review.run":
        return processReviewJob(job as Job<ReviewJobData>);
      default:
        console.warn(`[worker] Unknown job type: ${(job.data as JobData).type}`);
    }
  },
  {
    connection: getConnection(),
    concurrency: 3,
  },
);

worker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

console.log("[worker] PR Guardian worker started");
