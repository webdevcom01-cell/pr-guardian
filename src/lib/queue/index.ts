import { Queue, type ConnectionOptions } from "bullmq";

const QUEUE_NAME = "pr-guardian";

export interface ReviewJobData {
  type: "review.run";
  repoId: string;
  pullRequestId: string;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  userToken?: string;
}

export type JobData = ReviewJobData;

function getConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for job queue");
  return { url };
}

let queue: Queue<JobData> | null = null;

export function getQueue(): Queue<JobData> {
  if (queue) return queue;
  queue = new Queue<JobData>(QUEUE_NAME, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { age: 86400, count: 500 },
      removeOnFail: { age: 604800 },
    },
  });
  return queue;
}

export async function addReviewJob(data: Omit<ReviewJobData, "type">): Promise<string> {
  const q = getQueue();
  const job = await q.add(
    "review.run",
    { ...data, type: "review.run" },
    {
      priority: 1,
      jobId: `review-${data.pullRequestId}`,
    },
  );
  return job.id ?? `review-${data.pullRequestId}`;
}

export async function closeQueue(): Promise<void> {
  if (queue) { await queue.close(); queue = null; }
}
