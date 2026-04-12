import { Octokit } from "@octokit/rest";
import crypto from "crypto";

export function getOctokit(token?: string): Octokit {
  return new Octokit({ auth: token ?? process.env.GITHUB_TOKEN });
}

/** Fetch the unified diff for a PR */
export async function getPRDiff(
  owner: string,
  repo: string,
  pullNumber: number,
  token?: string,
): Promise<string> {
  const octokit = getOctokit(token);
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    { owner, repo, pull_number: pullNumber, mediaType: { format: "diff" } },
  );
  return response.data as unknown as string;
}

/** Post a review comment on a PR */
export async function postPRComment(
  owner: string,
  repo: string,
  pullNumber: number,
  body: string,
  token?: string,
): Promise<number> {
  const octokit = getOctokit(token);
  const response = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body,
  });
  return response.data.id;
}

/** Register a webhook on a GitHub repo */
export async function registerWebhook(
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string,
  token: string,
): Promise<number> {
  const octokit = getOctokit(token);
  const response = await octokit.repos.createWebhook({
    owner,
    repo,
    config: { url: webhookUrl, content_type: "json", secret },
    events: ["pull_request"],
    active: true,
  });
  return response.data.id;
}

/** Delete a webhook from a GitHub repo */
export async function deleteWebhook(
  owner: string,
  repo: string,
  hookId: number,
  token: string,
): Promise<void> {
  const octokit = getOctokit(token);
  await octokit.repos.deleteWebhook({ owner, repo, hook_id: hookId });
}

/** Generate a random webhook secret */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Verify GitHub webhook HMAC-SHA256 signature */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Format a review comment as Markdown for GitHub */
export function formatReviewComment(review: {
  decision: string;
  compositeScore: number;
  securityScore: number;
  qualityScore: number;
  summary: string;
  issues: Array<{
    severity: string;
    category: string;
    file: string;
    line?: number;
    message: string;
    fix: string;
  }>;
}): string {
  const icon =
    review.decision === "APPROVE" ? "✅" :
    review.decision === "APPROVE_WITH_NOTES" ? "⚠️" : "🚫";

  const scoreBar = (score: number) => {
    const filled = Math.round(score / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${score}/100`;
  };

  const criticalIssues = review.issues.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH");
  const otherIssues = review.issues.filter((i) => i.severity !== "CRITICAL" && i.severity !== "HIGH");

  let comment = `## ${icon} PR Guardian Review — ${review.decision.replace(/_/g, " ")}

${review.summary}

### Scores
| Metric | Score |
|--------|-------|
| Overall | ${scoreBar(review.compositeScore)} |
| Security | ${scoreBar(review.securityScore)} |
| Quality | ${scoreBar(review.qualityScore)} |
`;

  if (criticalIssues.length > 0) {
    comment += `\n### 🔴 Critical / High Issues\n`;
    for (const issue of criticalIssues) {
      comment += `\n**[${issue.severity}] ${issue.category}** — \`${issue.file}${issue.line ? `:${issue.line}` : ""}\`\n`;
      comment += `> ${issue.message}\n\n`;
      comment += `**Fix:** ${issue.fix}\n`;
    }
  }

  if (otherIssues.length > 0) {
    comment += `\n<details><summary>📋 ${otherIssues.length} other issue(s)</summary>\n\n`;
    for (const issue of otherIssues) {
      comment += `**[${issue.severity}] ${issue.category}** — \`${issue.file}\`\n> ${issue.message}\n> **Fix:** ${issue.fix}\n\n`;
    }
    comment += `</details>`;
  }

  comment += `\n\n---\n*Reviewed by [PR Guardian](https://github.com/apps/pr-guardian) 🛡️*`;
  return comment;
}
