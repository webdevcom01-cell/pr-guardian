# Changelog

All notable changes to PR Guardian are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-04-14

Initial public release.

### Added

**Core review pipeline**
- Webhook receiver at `POST /api/webhooks/github` with HMAC-SHA256 signature verification
- BullMQ job queue for async review processing (Redis-backed)
- AI review using Vercel AI SDK with automatic model fallback (DeepSeek → OpenAI → Anthropic)
- Structured review output: decision (`APPROVE` / `APPROVE_WITH_NOTES` / `BLOCK`), composite score, security score, quality score, per-issue list with severity and suggested fix
- GitHub PR comment posting with formatted Markdown review
- Duplicate detection — skips re-review if the same PR + SHA was already processed

**GitHub integration**
- Commit status checks (`pr-guardian/review`) set to `pending` on job start, `success` or `failure` on completion, `error` on exception
- Incremental re-review on `synchronize` events — only diffs since the last reviewed SHA are analyzed
- Webhook auto-install when connecting a repository

**Configuration**
- `.pr-guardian.yml` per-repository config: path exclusion (glob patterns), severity threshold, blocking rules, max issues
- Default config applied when no `.pr-guardian.yml` is present

**Auth and access**
- GitHub OAuth login with minimal scopes: `read:user user:email public_repo admin:repo_hook repo:status`
- Optional full `repo` scope for private repository access
- Permissions transparency on login page — each scope listed with description

**Infrastructure**
- Railway deployment — web service (Next.js) and worker service (BullMQ) as separate Railway services
- PostgreSQL via Railway with Prisma v6 ORM
- Redis rate limiting — 10 webhook events per repository per hour
- Health check endpoint at `GET /api/health`

**Dashboard**
- Repository management — connect, disconnect, view status
- Review history per repository and per pull request
- Metrics dashboard — 30-day activity chart, decision breakdown, score distribution, top issue categories, per-repo table

**Testing**
- 83 unit tests across 7 test files
- Coverage: webhook handler, AI model fallback, reviewer pipeline lifecycle, config parsing, incremental review logic, GitHub webhook signature verification, commit status description limits

[0.1.0]: https://github.com/your-org/pr-guardian/releases/tag/v0.1.0
