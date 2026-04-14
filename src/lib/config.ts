import { z } from "zod";
import { load as parseYaml } from "js-yaml";
import { minimatch } from "minimatch";
import { getOctokit } from "@/lib/github";
import { logger } from "@/lib/logger";

export const RepoConfigSchema = z.object({
  model: z.string().optional(),
  severityThreshold: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  skipPaths: z.array(z.string()).optional(),
  blockOn: z.array(z.enum(["CRITICAL", "HIGH"])).optional(),
  maxIssues: z.number().int().min(1).max(50).optional(),
  reviewLanguages: z.array(z.string()).optional(),
});

export type RepoConfig = z.infer<typeof RepoConfigSchema>;

export const DEFAULT_CONFIG = {
  severityThreshold: "LOW" as const,
  blockOn: ["CRITICAL"] as const,
  maxIssues: 20,
} satisfies RepoConfig;

export async function fetchRepoConfig(
  owner: string,
  repo: string,
  userToken?: string,
): Promise<RepoConfig> {
  const octokit = getOctokit(userToken);
  try {
    const response = await octokit.repos.getContent({ owner, repo, path: ".pr-guardian.yml" });
    const file = response.data;

    if (Array.isArray(file) || file.type !== "file") {
      return {};
    }

    const content = Buffer.from(file.content, "base64").toString("utf-8");
    const parsed = parseYaml(content);
    const result = RepoConfigSchema.safeParse(parsed);

    if (!result.success) {
      logger.warn("Invalid .pr-guardian.yml — using defaults", {
        owner,
        repo,
        errors: result.error.errors.map((e) => e.message).join(", "),
      });
      return {};
    }

    return result.data;
  } catch (err) {
    const status = err instanceof Object && "status" in err ? (err as { status: number }).status : undefined;
    if (status !== 404) {
      logger.warn("Failed to fetch .pr-guardian.yml — using defaults", { owner, repo });
    }
    return {};
  }
}

export function applyConfig(config: RepoConfig, diff: string): string {
  const skipPatterns = config.skipPaths ?? [];
  const allowExtensions = config.reviewLanguages;

  if (skipPatterns.length === 0 && (!allowExtensions || allowExtensions.length === 0)) {
    return diff;
  }

  const lines = diff.split("\n");
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git") && current.length > 0) {
      sections.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    sections.push(current);
  }

  const filtered = sections.filter((section) => {
    const header = section[0];
    const match = /^diff --git a\/(.+) b\/.+$/.exec(header);
    if (!match) return true;

    const filePath = match[1];

    if (skipPatterns.some((pattern) => minimatch(filePath, pattern))) {
      return false;
    }

    if (allowExtensions && allowExtensions.length > 0) {
      const dotIndex = filePath.lastIndexOf(".");
      const ext = dotIndex !== -1 ? filePath.slice(dotIndex) : "";
      if (!allowExtensions.includes(ext)) {
        return false;
      }
    }

    return true;
  });

  return filtered.map((s) => s.join("\n")).join("\n");
}
