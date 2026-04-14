import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── module mocks ─────────────────────────────────────────────────────────────

const mockCreateCommitStatus = vi.fn().mockResolvedValue(undefined);
const mockGetPRDiff          = vi.fn();
const mockPostPRComment      = vi.fn().mockResolvedValue(42);
const mockFormatReviewComment = vi.fn().mockReturnValue("## Review");

vi.mock("@/lib/github", () => ({
  getPRDiff:           (...args: unknown[]) => mockGetPRDiff(...args),
  postPRComment:       (...args: unknown[]) => mockPostPRComment(...args),
  formatReviewComment: (...args: unknown[]) => mockFormatReviewComment(...args),
  createCommitStatus:  (...args: unknown[]) => mockCreateCommitStatus(...args),
}));

vi.mock("@/lib/config", () => ({
  fetchRepoConfig: vi.fn().mockResolvedValue({}),
  applyConfig:     vi.fn().mockImplementation((_config: unknown, diff: string) => diff),
  DEFAULT_CONFIG:  { severityThreshold: "LOW", blockOn: ["CRITICAL"], maxIssues: 20 },
}));

vi.mock("@/lib/embeddings", () => ({
  getContextForReview: vi.fn().mockResolvedValue(""),
  indexRepository:     vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ai", () => ({
  callWithFallback: vi.fn().mockResolvedValue({
    result: {
      object: {
        decision: "APPROVE",
        compositeScore: 90,
        securityScore: 95,
        qualityScore: 88,
        issues: [],
        summary: "Looks good",
      },
    },
    modelId: "deepseek-chat",
  }),
}));

const mockPrismaCreate     = vi.fn().mockResolvedValue({ id: "review-123" });
const mockPrismaUpdate     = vi.fn().mockResolvedValue({});
const mockPrismaFindFirst  = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      create:    (...args: unknown[]) => mockPrismaCreate(...args),
      update:    (...args: unknown[]) => mockPrismaUpdate(...args),
      findFirst: (...args: unknown[]) => mockPrismaFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── import after mocks ───────────────────────────────────────────────────────

import { runReview } from "@/lib/reviewer";

const BASE_INPUT = {
  repoId:        "repo-1",
  pullRequestId: "pr-1",
  owner:         "acme",
  repo:          "app",
  prNumber:      42,
  headSha:       "abc123",
  userToken:     "ghp_test",
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe("runReview — commit status lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCommitStatus.mockResolvedValue(undefined);
    mockPostPRComment.mockResolvedValue(42);
    mockPrismaCreate.mockResolvedValue({ id: "review-123" });
    mockPrismaFindFirst.mockResolvedValue(null);
    mockFormatReviewComment.mockReturnValue("## Review");
  });

  it("sets PENDING status immediately when review starts", async () => {
    mockGetPRDiff.mockResolvedValue("diff --git a/foo.ts b/foo.ts\n+const x = 1;");

    await runReview(BASE_INPUT);

    const firstCall = mockCreateCommitStatus.mock.calls[0];
    expect(firstCall[3]).toBe("pending");
    expect(firstCall[4]).toContain("reviewing");
  });

  it("sets pending before any other work (first call is always pending)", async () => {
    mockGetPRDiff.mockResolvedValue("diff --git a/foo.ts b/foo.ts\n+const x = 1;");

    await runReview(BASE_INPUT);

    expect(mockCreateCommitStatus.mock.calls[0][3]).toBe("pending");
  });

  it("sets SUCCESS status for empty diff", async () => {
    mockGetPRDiff.mockResolvedValue("");

    const result = await runReview(BASE_INPUT);

    expect(result).toBe("empty-diff");
    const statusCalls = mockCreateCommitStatus.mock.calls.map((c) => c[3]);
    expect(statusCalls).toContain("success");
    const successCall = mockCreateCommitStatus.mock.calls.find((c) => c[3] === "success");
    expect(successCall![4]).toContain("No changes to review");
  });

  it("sets SUCCESS status when all files filtered by config", async () => {
    const { applyConfig } = await import("@/lib/config");
    vi.mocked(applyConfig).mockReturnValueOnce("");
    mockGetPRDiff.mockResolvedValue("diff --git a/dist/bundle.js b/dist/bundle.js\n+const x = 1;");

    const result = await runReview(BASE_INPUT);

    expect(result).toBe("filtered-diff");
    const successCall = mockCreateCommitStatus.mock.calls.find((c) => c[3] === "success");
    expect(successCall![4]).toContain("excluded");
  });

  it("sets SUCCESS status when review decision is APPROVE", async () => {
    mockGetPRDiff.mockResolvedValue("diff --git a/foo.ts b/foo.ts\n+const x = 1;");

    await runReview(BASE_INPUT);

    const finalCall = mockCreateCommitStatus.mock.calls.at(-1)!;
    expect(finalCall[3]).toBe("success");
    expect(finalCall[4]).toContain("Approved");
    expect(finalCall[4]).toContain("90/100");
  });

  it("sets FAILURE status when decision is BLOCK", async () => {
    const { callWithFallback } = await import("@/lib/ai");
    vi.mocked(callWithFallback).mockResolvedValueOnce({
      result: {
        object: {
          decision:       "BLOCK",
          compositeScore: 30,
          securityScore:  10,
          qualityScore:   50,
          issues: [
            { severity: "CRITICAL", category: "security", file: "auth.ts", message: "SQL injection", fix: "use params" },
            { severity: "HIGH",     category: "security", file: "api.ts",  message: "XSS risk",     fix: "sanitize"  },
          ],
          summary: "Critical security issues found",
        },
      },
      modelId: "deepseek-chat",
    });
    mockGetPRDiff.mockResolvedValue("diff --git a/auth.ts b/auth.ts\n+const q = `SELECT * FROM users WHERE id = ${id}`;");

    await runReview(BASE_INPUT);

    const finalCall = mockCreateCommitStatus.mock.calls.at(-1)!;
    expect(finalCall[3]).toBe("failure");
    expect(finalCall[4]).toContain("Blocked");
    expect(finalCall[4]).toContain("30/100");
  });

  it("sets ERROR status and re-throws when an exception occurs mid-review", async () => {
    mockGetPRDiff.mockRejectedValue(new Error("GitHub API unreachable"));

    await expect(runReview(BASE_INPUT)).rejects.toThrow("GitHub API unreachable");

    const statusCalls = mockCreateCommitStatus.mock.calls.map((c) => c[3]);
    expect(statusCalls).toContain("pending");
    expect(statusCalls).toContain("error");
  });

  it("never throws if createCommitStatus itself fails (best-effort)", async () => {
    mockCreateCommitStatus.mockRejectedValue(new Error("GitHub status API down"));
    mockGetPRDiff.mockResolvedValue("diff --git a/foo.ts b/foo.ts\n+const x = 1;");

    // Should complete normally despite status API being down
    await expect(runReview(BASE_INPUT)).resolves.toBeDefined();
  });

  it("sets pending status with correct owner/repo/sha", async () => {
    mockGetPRDiff.mockResolvedValue("diff --git a/foo.ts b/foo.ts\n+x");

    await runReview(BASE_INPUT);

    const pendingCall = mockCreateCommitStatus.mock.calls[0];
    expect(pendingCall[0]).toBe("acme");
    expect(pendingCall[1]).toBe("app");
    expect(pendingCall[2]).toBe("abc123");
  });

  it("persists review to database after successful review", async () => {
    mockGetPRDiff.mockResolvedValue("diff --git a/foo.ts b/foo.ts\n+x");

    await runReview(BASE_INPUT);

    expect(mockPrismaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pullRequestId: "pr-1",
          decision: "APPROVE",
        }),
      }),
    );
  });

  it("posts GitHub comment after review is persisted", async () => {
    mockGetPRDiff.mockResolvedValue("diff --git a/foo.ts b/foo.ts\n+x");

    await runReview(BASE_INPUT);

    expect(mockPostPRComment).toHaveBeenCalledWith(
      "acme", "app", 42, expect.any(String), "ghp_test",
    );
  });

  it("returns review ID on success", async () => {
    mockGetPRDiff.mockResolvedValue("diff --git a/foo.ts b/foo.ts\n+x");
    mockPrismaCreate.mockResolvedValue({ id: "review-xyz" });

    const result = await runReview(BASE_INPUT);

    expect(result).toBe("review-xyz");
  });
});
