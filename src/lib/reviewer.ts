import { generateObject } from "ai";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import { callWithFallback } from "@/lib/ai";
import { getPRDiff, postPRComment, formatReviewComment, type IncrementalSummary } from "@/lib/github";
import { fetchRepoConfig, applyConfig, DEFAULT_CONFIG } from "@/lib/config";
import { indexRepository, getContextForReview } from "@/lib/embeddings";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const ReviewIssueSchema = z.object({
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  category: z.enum(["security", "quality", "convention", "performance"]),
  file: z.string(),
  line: z.number().optional(),
  message: z.string(),
  fix: z.string(),
});

const ReviewOutputSchema = z.object({
  decision: z.enum(["APPROVE", "APPROVE_WITH_NOTES", "BLOCK"]),
  compositeScore: z.number().min(0).max(100),
  securityScore: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  issues: z.array(ReviewIssueSchema).max(20),
  summary: z.string().max(500),
});

type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

const CHUNK_SIZE = 80_000;

function parseIssues(raw: Prisma.JsonValue): Array<{ file: string; message: string; severity: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is { file: string; message: string; severity: string } =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).file === "string" &&
      typeof (item as Record<string, unknown>).message === "string",
  );
}

const SEVERITY_RANK: Record<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function buildReviewSchema(maxIssues: number) {
  return ReviewOutputSchema.extend({
    issues: z.array(ReviewIssueSchema).max(maxIssues),
  });
}

const DECISION_RANK: Record<ReviewOutput["decision"], number> = {
  APPROVE: 0,
  APPROVE_WITH_NOTES: 1,
  BLOCK: 2,
};

export function splitDiffIntoChunks(diff: string): string[] {
  const lines = diff.split("\n");
  const fileSections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git") && current.length > 0) {
      fileSections.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    fileSections.push(current.join("\n"));
  }

  const chunks: string[] = [];
  let currentChunk = "";

  for (const section of fileSections) {
    if (currentChunk.length + section.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = section;
    } else {
      currentChunk = currentChunk.length > 0 ? `${currentChunk}\n${section}` : section;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export interface ChunkResult {
  review: ReviewOutput;
  chunkSize: number;
}

export function mergeReviews(results: ChunkResult[]): { review: ReviewOutput; coveragePercent: number } {
  const totalBytes = results.reduce((sum, r) => sum + r.chunkSize, 0);

  const issues = results.flatMap((r) => r.review.issues);

  const weightedAvg = (field: "compositeScore" | "securityScore" | "qualityScore"): number =>
    Math.round(results.reduce((sum, r) => sum + r.review[field] * r.chunkSize, 0) / totalBytes);

  const decision = results.reduce<ReviewOutput["decision"]>((worst, r) => {
    return DECISION_RANK[r.review.decision] > DECISION_RANK[worst] ? r.review.decision : worst;
  }, "APPROVE");

  const summary = results.map((r, i) => `**Part ${i + 1}:** ${r.review.summary}`).join("\n\n");

  return {
    review: {
      decision,
      compositeScore: weightedAvg("compositeScore"),
      securityScore: weightedAvg("securityScore"),
      qualityScore: weightedAvg("qualityScore"),
      issues,
      summary,
    },
    coveragePercent: 100,
  };
}

const SYSTEM_PROMPT = `You are PR Guardian, an expert AI code reviewer focused on security, quality, and best practices.

Review the provided git diff and output a structured review.

DECISION RULES:
- BLOCK: Any CRITICAL security issue, SQL injection, XSS, exposed secrets, broken auth, or >3 HIGH issues
- APPROVE_WITH_NOTES: 1-3 HIGH issues or several MEDIUMs — needs attention but not blocking
- APPROVE: Clean code with only LOW issues or none

SCORING:
- compositeScore: weighted average (security 40%, quality 60%)
- securityScore: 100 if no security issues, -25 per HIGH, -50 per CRITICAL
- qualityScore: 100 if no quality issues, -10 per LOW, -20 per MEDIUM, -40 per HIGH

Be specific: include file paths, line numbers when visible, and concrete fix instructions.
Do NOT flag style issues unless they are project-convention violations visible in the diff.`;

function buildPrompt(diff: string, context: string): string {
  if (!context) {
    return `Review this pull request diff:\n\n\`\`\`diff\n${diff}\n\`\`\``;
  }
  return `${context}\n\nNow review this pull request diff, using the codebase context above to provide more specific and relevant feedback:\n\n\`\`\`diff\n${diff}\n\`\`\``;
}

export interface ReviewJobInput {
  repoId: string;
  pullRequestId: string;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  userToken?: string;
}

export async function runReview(input: ReviewJobInput): Promise<string> {
  const startedAt = Date.now();

  // 1. Fetch the diff
  const diff = await getPRDiff(input.owner, input.repo, input.prNumber, input.userToken);

  if (!diff || diff.trim().length === 0) {
    logger.info("Empty diff, skipping review", { pullRequestId: input.pullRequestId });
    return "empty-diff";
  }

  // 2. Load per-repo config and apply path filters
  const config = await fetchRepoConfig(input.owner, input.repo, input.userToken);
  const filteredDiff = applyConfig(config, diff);

  if (!filteredDiff || filteredDiff.trim().length === 0) {
    logger.info("All files filtered by config, skipping review", { pullRequestId: input.pullRequestId });
    return "filtered-diff";
  }

  // 3. Retrieve relevant codebase context for this diff
  const contextStr = await getContextForReview(input.repoId, filteredDiff, input.userToken).catch(() => "");

  // Fire-and-forget background re-indexing (non-blocking)
  indexRepository(input.repoId, input.owner, input.repo, input.userToken).catch((err) =>
    logger.warn("Background repo indexing failed", {
      repoId: input.repoId,
      error: err instanceof Error ? err.message : String(err),
    })
  );

  // 4. Run AI review — chunked in parallel for large diffs
  const reviewSchema = buildReviewSchema(config.maxIssues ?? DEFAULT_CONFIG.maxIssues);
  let finalReview: ReviewOutput;
  let coveragePercent = 100;
  let usedModel: string;

  if (filteredDiff.length <= CHUNK_SIZE) {
    const { result: { object }, modelId } = await callWithFallback(
      (model) => generateObject({
        model,
        schema: reviewSchema,
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(filteredDiff, contextStr),
        temperature: 0.1,
      }),
      config.model,
    );
    finalReview = object;
    usedModel = modelId;
  } else {
    const chunks = splitDiffIntoChunks(filteredDiff);
    logger.info("Reviewing large diff in parallel chunks", {
      pullRequestId: input.pullRequestId,
      totalBytes: filteredDiff.length,
      chunkCount: chunks.length,
    });

    const chunkResults = await Promise.all(
      chunks.map((chunk, i) =>
        callWithFallback(
          (model) => generateObject({
            model,
            schema: reviewSchema,
            system: SYSTEM_PROMPT,
            prompt: buildPrompt(chunk, contextStr),
            temperature: 0.1,
          }),
          config.model,
        ).then(({ result: { object }, modelId }) => ({ review: object, chunkSize: chunk.length, modelId })),
      ),
    );

    const merged = mergeReviews(chunkResults);
    finalReview = merged.review;
    coveragePercent = merged.coveragePercent;
    usedModel = chunkResults[0].modelId;
  }

  // Filter issues below configured severity threshold
  const threshold = SEVERITY_RANK[config.severityThreshold ?? DEFAULT_CONFIG.severityThreshold];
  finalReview = {
    ...finalReview,
    issues: finalReview.issues.filter((issue) => SEVERITY_RANK[issue.severity] >= threshold),
  };

  // Compute incremental diff against the most recent previous review for this PR
  const previousReview = await prisma.review.findFirst({
    where: {
      pullRequest: {
        repoId: input.repoId,
        prNumber: input.prNumber,
      },
      NOT: { pullRequestId: input.pullRequestId },
    },
    orderBy: { createdAt: "desc" },
    include: { pullRequest: true },
  });

  let incrementalSummary: IncrementalSummary | undefined;

  if (previousReview) {
    const prevIssues = parseIssues(previousReview.issues);
    const currIssues = finalReview.issues.map((i) => ({ file: i.file, message: i.message, severity: i.severity }));

    const issueKey = (issue: { file: string; message: string }): string =>
      `${issue.file}::${issue.message.trim().toLowerCase()}`;

    const prevKeys = new Set(prevIssues.map(issueKey));
    const currKeys = new Set(currIssues.map(issueKey));

    const resolvedIssues = prevIssues.filter((i) => !currKeys.has(issueKey(i)));
    const newIssues = currIssues.filter((i) => !prevKeys.has(issueKey(i)));
    const persistingCount = currIssues.filter((i) => prevKeys.has(issueKey(i))).length;

    incrementalSummary = {
      isFollowUp: true,
      previousScore: previousReview.compositeScore,
      scoreDelta: finalReview.compositeScore - previousReview.compositeScore,
      resolvedCount: resolvedIssues.length,
      newCount: newIssues.length,
      persistingCount,
      resolvedIssues,
      newIssues,
    };
  }

  const durationMs = Date.now() - startedAt;

  // 5. Persist review
  const review = await prisma.review.create({
    data: {
      pullRequestId: input.pullRequestId,
      decision: finalReview.decision,
      compositeScore: finalReview.compositeScore,
      securityScore: finalReview.securityScore,
      qualityScore: finalReview.qualityScore,
      issues: finalReview.issues,
      summary: finalReview.summary,
      durationMs,
      modelUsed: usedModel,
    },
  });

  // 6. Post comment to GitHub
  const commentBody = formatReviewComment(
    {
      decision: finalReview.decision,
      compositeScore: finalReview.compositeScore,
      securityScore: finalReview.securityScore,
      qualityScore: finalReview.qualityScore,
      summary: finalReview.summary,
      issues: finalReview.issues,
      coveragePercent,
      totalBytes: diff.length,
      reviewedBytes: diff.length,
    },
    incrementalSummary,
  );

  const commentId = await postPRComment(
    input.owner,
    input.repo,
    input.prNumber,
    commentBody,
    input.userToken,
  );

  // 7. Save comment ID back to review
  await prisma.review.update({
    where: { id: review.id },
    data: { githubCommentId: commentId },
  });

  return review.id;
}
