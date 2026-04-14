# PR Guardian

AI-powered code review for GitHub pull requests. PR Guardian hooks into your repositories via webhooks, reviews every PR automatically using large language models, and posts a structured comment with a security score, quality score, and actionable feedback — directly on the pull request.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org)
[![Railway](https://img.shields.io/badge/Deploy-Railway-blueviolet)](https://railway.app)

---

## How it works

1. Connect a GitHub repository — PR Guardian installs a webhook automatically.
2. When a pull request is opened, synchronized, or reopened, the webhook fires.
3. The diff is fetched, filtered by your `.pr-guardian.yml` config, and sent to an AI model.
4. A review comment is posted on the PR with a security score, quality score, and per-issue feedback.
5. A GitHub commit status check (`pr-guardian/review`) is set — green for approved, red for blocked — enabling branch protection rules.

---

## Features

- **Automated PR reviews** — triggered on `opened`, `synchronize`, and `reopened` events
- **GitHub commit status checks** — pending → success/failure per commit SHA
- **Incremental reviews** — only diffs since the last reviewed SHA are re-analyzed on new pushes
- **Configurable filtering** — exclude paths, set severity thresholds, override blocking rules via `.pr-guardian.yml`
- **AI model fallback** — tries DeepSeek → OpenAI → Anthropic in order; uses whichever is available
- **Rate limiting** — 10 webhook events per repository per hour (Redis-backed)
- **Duplicate detection** — skips re-review if the same PR + SHA combination was already reviewed
- **Metrics dashboard** — 30-day activity chart, per-repo stats, score trends
- **Self-hostable** — runs on Railway (or any Node.js host) with your own API keys

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15, App Router |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v3 |
| Database | PostgreSQL (Railway) + Prisma v6 |
| Queue | BullMQ + Redis |
| Auth | NextAuth v5 — GitHub OAuth |
| AI | Vercel AI SDK v4 — DeepSeek, OpenAI, Anthropic |
| GitHub | Octokit REST |
| Deploy | Railway (web service + worker service) |

---

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 9+
- A PostgreSQL database (Railway recommended)
- A Redis instance (Railway recommended)
- A GitHub OAuth App
- At least one AI provider API key (DeepSeek, OpenAI, or Anthropic)

### 1. Clone and install

```bash
git clone https://github.com/your-org/pr-guardian
cd pr-guardian
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local` — see [docs/deployment.md](docs/deployment.md) for a full walkthrough.

### 3. Set up the database

```bash
pnpm db:push       # push schema to your PostgreSQL instance
pnpm db:generate   # generate Prisma client
```

### 4. Run locally

```bash
# Terminal 1 — web server
pnpm dev

# Terminal 2 — queue worker (required for reviews to process)
pnpm worker
```

Open [http://localhost:3000](http://localhost:3000), sign in with GitHub, and connect a repository.

---

## Repository configuration

Place a `.pr-guardian.yml` file in the root of any connected repository to customize review behavior:

```yaml
# Paths to exclude from review (glob patterns)
exclude:
  - "**/*.lock"
  - "dist/**"
  - "*.min.js"

# Minimum severity to include in the review comment
# Options: LOW | MEDIUM | HIGH | CRITICAL
severityThreshold: LOW

# Decisions that block the PR (set commit status to failure)
# Options: CRITICAL | HIGH | MEDIUM | LOW
blockOn:
  - CRITICAL
  - HIGH

# Maximum number of issues to include in a single review
maxIssues: 20
```

See [docs/configuration.md](docs/configuration.md) for all options.

---

## Deployment

PR Guardian is designed for Railway with two services:

- **Web service** — Next.js app (`pnpm run start:railway`)
- **Worker service** — BullMQ worker (`pnpm run start:worker`)

Full deployment instructions: [docs/deployment.md](docs/deployment.md)

---

## Architecture

```
GitHub PR event
      │
      ▼
POST /api/webhooks/github
  ├── HMAC-SHA256 signature verification
  ├── Rate limit check (Redis)
  ├── Duplicate detection (DB)
  └── Enqueue BullMQ job
              │
              ▼
        BullMQ Worker
          ├── Set commit status → pending
          ├── Fetch PR diff (Octokit)
          ├── Apply .pr-guardian.yml filters
          ├── AI review (DeepSeek / OpenAI / Anthropic)
          ├── Persist Review to PostgreSQL
          ├── Post GitHub PR comment
          └── Set commit status → success | failure
```

Detailed architecture: [docs/architecture.md](docs/architecture.md)

---

## API reference

See [docs/api.md](docs/api.md).

---

## Development

```bash
pnpm dev            # dev server with Turbopack
pnpm worker         # BullMQ worker
pnpm test           # unit tests (Vitest)
pnpm typecheck      # TypeScript check
pnpm lint           # ESLint
pnpm db:studio      # Prisma Studio
pnpm db:push        # sync schema to DB
```

83 unit tests across 7 test files covering the webhook handler, AI fallback logic, reviewer pipeline, config parsing, incremental review, and GitHub utilities.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Security

See [SECURITY.md](SECURITY.md) for the responsible disclosure policy.

---

## License

[MIT](LICENSE)
