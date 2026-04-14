import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

// ─── mocks ────────────────────────────────────────────────────────────────────

const mockFindUnique  = vi.fn();
const mockFindFirst   = vi.fn();
const mockUpsert      = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    repository: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    pullRequest: { upsert:     (...a: unknown[]) => mockUpsert(...a)     },
    review:      { findFirst:  (...a: unknown[]) => mockFindFirst(...a)  },
  },
}));

const mockAddReviewJob = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/queue", () => ({
  addReviewJob: (...a: unknown[]) => mockAddReviewJob(...a),
}));

const mockRedisIncr   = vi.fn().mockResolvedValue(1);
const mockRedisExpire = vi.fn().mockResolvedValue(1);
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ incr: mockRedisIncr, expire: mockRedisExpire }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import route handler after mocks
import { POST } from "@/app/api/webhooks/github/route";

// ─── helpers ─────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = "super-secret";

function sign(body: string, secret = WEBHOOK_SECRET) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

function makeRequest(body: object, options: { secret?: string; event?: string; signature?: string } = {}) {
  const raw = JSON.stringify(body);
  const sig  = options.signature ?? sign(raw, options.secret ?? WEBHOOK_SECRET);
  return new NextRequest("http://localhost/api/webhooks/github", {
    method: "POST",
    headers: {
      "content-type":        "application/json",
      "x-github-event":      options.event ?? "pull_request",
      "x-hub-signature-256": sig,
      "x-github-delivery":   "test-delivery-id",
    },
    body: raw,
  });
}

const VALID_REPO = {
  id: "repo-db-1",
  isActive: true,
  webhookSecret: WEBHOOK_SECRET,
  user: { githubToken: "ghp_token" },
};

const VALID_PR_PAYLOAD = {
  action: "opened",
  repository: { id: 12345, full_name: "acme/app" },
  pull_request: {
    number: 7,
    title: "Add feature",
    user: { login: "dev" },
    head: { sha: "abc123", ref: "feature/x" },
    base: { ref: "main" },
    html_url: "https://github.com/acme/app/pull/7",
  },
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/github", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisIncr.mockResolvedValue(1);
    mockFindFirst.mockResolvedValue(null);   // no existing review
    mockUpsert.mockResolvedValue({ id: "pr-db-1" });
  });

  it("ignores non-pull_request events", async () => {
    const req = makeRequest({}, { event: "push" });
    const res = await POST(req);
    const body = await res.json();
    expect(body.ignored).toBe(true);
    expect(body.event).toBe("push");
  });

  it("ignores PR actions other than opened/synchronize/reopened", async () => {
    const payload = { ...VALID_PR_PAYLOAD, action: "labeled" };
    const req = makeRequest(payload);
    const res = await POST(req);
    expect((await res.json()).ignored).toBe(true);
  });

  it("returns 401 for invalid HMAC signature", async () => {
    mockFindUnique.mockResolvedValue(VALID_REPO);
    const req = makeRequest(VALID_PR_PAYLOAD, { secret: "wrong-secret" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("ignores events for unknown repositories", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = makeRequest(VALID_PR_PAYLOAD);
    const res = await POST(req);
    const body = await res.json();
    expect(body.ignored).toBe(true);
    expect(body.reason).toBe("repo not connected");
  });

  it("ignores events for inactive repositories", async () => {
    mockFindUnique.mockResolvedValue({ ...VALID_REPO, isActive: false });
    const req = makeRequest(VALID_PR_PAYLOAD);
    const res = await POST(req);
    expect((await res.json()).ignored).toBe(true);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockFindUnique.mockResolvedValue(VALID_REPO);
    mockRedisIncr.mockResolvedValue(11); // over limit of 10

    const req = makeRequest(VALID_PR_PAYLOAD);
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("skips duplicate webhook when review already exists for PR+SHA", async () => {
    mockFindUnique.mockResolvedValue(VALID_REPO);
    mockUpsert.mockResolvedValue({ id: "pr-db-1" });
    mockFindFirst.mockResolvedValue({ id: "existing-review" });

    const req = makeRequest(VALID_PR_PAYLOAD);
    const res = await POST(req);
    const body = await res.json();

    expect(body.ignored).toBe(true);
    expect(body.reason).toBe("review already exists");
    expect(mockAddReviewJob).not.toHaveBeenCalled();
  });

  it("enqueues review job for valid new PR webhook", async () => {
    mockFindUnique.mockResolvedValue(VALID_REPO);
    mockUpsert.mockResolvedValue({ id: "pr-db-1" });

    const req = makeRequest(VALID_PR_PAYLOAD);
    const res = await POST(req);
    const body = await res.json();

    expect(body.queued).toBe(true);
    expect(mockAddReviewJob).toHaveBeenCalledWith(
      expect.objectContaining({
        owner:    "acme",
        repo:     "app",
        prNumber: 7,
        headSha:  "abc123",
      }),
    );
  });

  it("handles synchronize action (new commits pushed)", async () => {
    mockFindUnique.mockResolvedValue(VALID_REPO);
    mockUpsert.mockResolvedValue({ id: "pr-db-1" });

    const payload = { ...VALID_PR_PAYLOAD, action: "synchronize" };
    const req = makeRequest(payload);
    const res = await POST(req);

    expect((await res.json()).queued).toBe(true);
    expect(mockAddReviewJob).toHaveBeenCalled();
  });

  it("returns 500 when enqueue job fails", async () => {
    mockFindUnique.mockResolvedValue(VALID_REPO);
    mockUpsert.mockResolvedValue({ id: "pr-db-1" });
    mockAddReviewJob.mockRejectedValue(new Error("Redis connection lost"));

    const req = makeRequest(VALID_PR_PAYLOAD);
    const res = await POST(req);

    expect(res.status).toBe(500);
  });

  it("continues processing when Redis rate limit check fails (non-fatal)", async () => {
    mockFindUnique.mockResolvedValue(VALID_REPO);
    mockUpsert.mockResolvedValue({ id: "pr-db-1" });
    mockFindFirst.mockResolvedValue(null);
    mockAddReviewJob.mockResolvedValue(undefined);
    mockRedisIncr.mockRejectedValue(new Error("Redis down"));

    const req = makeRequest(VALID_PR_PAYLOAD);
    const res = await POST(req);

    // Should still queue the job despite Redis failure
    expect((await res.json()).queued).toBe(true);
    expect(mockAddReviewJob).toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/github", {
      method: "POST",
      headers: {
        "content-type":        "application/json",
        "x-github-event":      "pull_request",
        "x-hub-signature-256": "sha256=invalid",
        "x-github-delivery":   "test",
      },
      body: "not-valid-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
