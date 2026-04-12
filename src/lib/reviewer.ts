import { generateObject } from "ai";
import { z } from "zod";
import { getModel, getModelName } from "@/lib/ai";
import { getPRDiff, postPRComment, formatReviewComment } from "@/lib/github";
import { prisma } from "@/lib/prisma";

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
    return "empty-diff";
  }

  // Truncate extremely large diffs to avoid token limits
  const truncatedDiff = diff.length > 80_000 ? diff.slice(0, 80_000) + "\n\n[diff truncated]" : diff;

  // 2. Run AI review
  const model = getModel();
  const { object } = await generateObject({
    model,
    schema: ReviewOutputSchema,
    system: SYSTEM_PROMPT,
    prompt: `Review this pull request diff:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``,
    temperature: 0.1,
  });

  const durationMs = Date.now() - startedAt;

  // 3. Persist review
  const review = await prisma.review.create({
    data: {
      pullRequestId: input.pullRequestId,
      decision: object.decision,
      compositeScore: object.compositeScore,
      securityScore: object.securityScore,
      qualityScore: object.qualityScore,
      issues: object.issues,
      summary: object.summary,
      durationMs,
      modelUsed: getModelName(),
    },
  });

  // 4. Post comment to GitHub
  const commentBody = formatReviewComment({
    decision: object.decision,
    compositeScore: object.compositeScore,
    securityScore: object.securityScore,
    qualityScore: object.qualityScore,
    summary: object.summary,
    issues: object.issues,
  });

  const commentId = await postPRComment(
    input.owner,
    input.repo,
    input.prNumber,
    commentBody,
    input.userToken,
  );

  // 5. Save comment ID back to review
  await prisma.review.update({
    where: { id: review.id },
    data: { githubCommentId: commentId },
  });

  return review.id;
}
