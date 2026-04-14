# Architecture

This document describes the system design, data flow, and key technical decisions in PR Guardian.

---

## Overview

PR Guardian is a Next.js 15 application with a separate BullMQ worker process. The two processes share a PostgreSQL database and a Redis instance but run independently — web handles HTTP traffic, worker handles AI processing.

```
                    ┌──────────────────────────────────────────────┐
                    │                  Railway                      │
                    │                                               │
  GitHub ──HTTPS──▶ │  Web Service (Next.js)                       │
                    │  ├── App Router API routes                    │
                    │  ├── NextAuth v5 (GitHub OAuth)               │
                    │  └── Dashboard UI (React Server Components)   │
                    │              │                                 │
                    │         BullMQ Queue                          │
                    │              │                                 │
                    │  Worker Service (tsx)                         │
                    │  ├── BullMQ processor                        │
                    │  ├── Octokit (GitHub API)                    │
                    │  └── Vercel AI SDK (DeepSeek / OpenAI / ...)  │
                    │                                               │
                    │  PostgreSQL ◀──── both services               │
                    │  Redis      ◀──── both services               │
                    └──────────────────────────────────────────────┘
```

---

## Webhook flow

```
GitHub sends POST /api/webhooks/github
          │
          ▼
1. Read raw body as text (needed for HMAC)
2. Extract x-github-event, x-hub-signature-256, x-github-delivery headers
3. If event ≠ pull_request → 200 { ignored: true }
4. Parse JSON body
5. If action ∉ { opened, synchronize, reopened } → 200 { ignored: true }
6. Look up Repository by githubId in DB
7. If not found or isActive=false → 200 { ignored: true, reason }
8. Verify HMAC-SHA256 signature using repo.webhookSecret → 401 on failure
9. Redis INCR rate limit key (10/hour per repo) → 429 on exceeded
10. Upsert PullRequest record in DB
11. Check if Review already exists for (pullRequestId, headSha) → 200 { ignored: true } if so
12. Enqueue BullMQ job with review input
13. 200 { queued: true }
```

---

## Review pipeline

The review pipeline runs inside the BullMQ worker process in `src/lib/reviewer.ts`.

```
runReview(input)
  │
  ├── createCommitStatus → pending
  │
  └── _runReview(input)
        │
        ├── getPRDiff(owner, repo, prNumber, userToken)
        │     └── if empty → createCommitStatus(success, "No changes") → return "empty-diff"
        │
        ├── fetchRepoConfig(owner, repo, userToken)
        │
        ├── applyConfig(config, diff)
        │     └── if filtered to empty → createCommitStatus(success, "excluded") → return "filtered-diff"
        │
        ├── getContextForReview(repoId, diff)   ← pgvector similarity search
        │
        ├── callWithFallback(fn)
        │     └── generateObject({ model, schema, system, prompt })
        │           DeepSeek → OpenAI → Anthropic (tries in order)
        │
        ├── prisma.review.create(...)
        │
        ├── formatReviewComment(review, incrementalSummary?)
        │
        ├── postPRComment(owner, repo, prNumber, comment, token)
        │
        └── createCommitStatus → success | failure
              └── on exception: createCommitStatus → error, rethrow
```

---

## Incremental review

On `synchronize` events (new commits pushed to an open PR), PR Guardian only reviews the diff _since the last reviewed commit_ rather than the full PR diff. This reduces token usage and keeps comments focused on new changes.

```
new push to PR (synchronize)
  │
  ├── Look up most recent Review for this PullRequest
  │     ├── found: baseSha = review.pullRequest.headSha (previous reviewed SHA)
  │     └── not found: review full diff from base branch
  │
  ├── getPRDiff with baseSha parameter
  │
  └── Format comment with IncrementalSummary:
        ├── previousSha
        ├── currentSha
        └── "Incremental review — changes since [sha]"
```

---

## AI model selection

`callWithFallback` in `src/lib/ai.ts` builds a candidate list from available environment variables:

| Priority | Model | Env var |
|---|---|---|
| 1 | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| 2 | `gpt-4o` | `OPENAI_API_KEY` |
| 3 | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |

Models are tried in order. If a model throws (rate limit, API error, etc.), the next one is tried. If all fail, the last error is thrown. A warning is logged for each failed model.

A preferred model can be passed as a second argument to skip to a specific provider first.

---

## Database schema

Five models: `User`, `Repository`, `RepoIndex`, `PullRequest`, `Review`.

```
User (1) ──── (N) Repository (1) ──── (N) PullRequest (1) ──── (N) Review
                       │
                  (N) RepoIndex
                  (pgvector embeddings stored via raw SQL ALTER TABLE)
```

Key constraints:
- `Repository.githubId` is unique (GitHub's numeric repo ID).
- `PullRequest` is unique on `(repoId, prNumber, headSha)` — this prevents duplicate reviews.
- All child records cascade-delete when the parent is removed.

---

## Rate limiting

Redis key format: `rate:webhook:{repositoryId}:{windowHour}`

- `INCR` on each webhook arrival; `EXPIRE` set to 3600s on first increment.
- Limit: 10 per window.
- If Redis is unavailable, the check is skipped and processing continues (non-fatal).

---

## Repository indexing (pgvector)

When a repository is connected, `indexRepository()` is called asynchronously to fetch the default branch tree, embed key files, and store them in `RepoIndex` with a `vector(1536)` column (OpenAI `text-embedding-3-small`).

During review, `getContextForReview()` runs a cosine similarity search against the indexed files to provide relevant codebase context to the AI prompt.

The vector column is managed via raw SQL (`ALTER TABLE "RepoIndex" ADD COLUMN IF NOT EXISTS embedding vector(1536)`) because Prisma does not natively support pgvector types.

---

## Railway multi-service setup

Two Railway services point at the same repository:

| Service | Start command | Purpose |
|---|---|---|
| Web | `pnpm run start:railway` | Serves HTTP traffic, runs `prisma db push` on boot |
| Worker | `pnpm run start:worker` | Processes BullMQ review jobs |

Both services share the same `DATABASE_URL` and `REDIS_URL` environment variables. The worker has no HTTP port — it connects to Redis and PostgreSQL directly.

This separation means a crashed worker does not restart the web server, and the web server can be scaled independently of review throughput.

---

## Security model

See [SECURITY.md](../SECURITY.md) for the full security design.

Key points:
- All webhook payloads are HMAC-SHA256 verified before any DB reads.
- GitHub tokens are stored server-side and never returned to clients.
- All API routes are protected by `requireAuth()` / `requireAgentOwner()` guards.
- Public paths are explicitly listed in `src/middleware.ts`.
