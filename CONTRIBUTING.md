# Contributing to PR Guardian

Thank you for taking the time to contribute. This document covers everything you need to get a working development environment, understand the project structure, and submit a pull request.

---

## Code of conduct

Be respectful and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

---

## Before you start

- For bug fixes and small improvements, open a pull request directly.
- For new features or significant changes, open an issue first so we can discuss the approach before you invest time writing code.
- For security vulnerabilities, follow the process in [SECURITY.md](SECURITY.md) instead of opening a public issue.

---

## Development setup

### Requirements

- Node.js 20+
- pnpm 9+
- PostgreSQL (local or Railway)
- Redis (local or Railway)

### 1. Fork and clone

```bash
git clone https://github.com/your-fork/pr-guardian
cd pr-guardian
pnpm install
```

### 2. Environment

```bash
cp .env.example .env.local
```

Minimum required variables for local development:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
AUTH_SECRET="any-random-string-for-local"
AUTH_GITHUB_ID="your-oauth-app-client-id"
AUTH_GITHUB_SECRET="your-oauth-app-client-secret"
DEEPSEEK_API_KEY="sk-..."      # or OPENAI_API_KEY or ANTHROPIC_API_KEY
REDIS_URL="redis://localhost:6379"
NEXTAUTH_URL="http://localhost:3000"
APP_URL="http://localhost:3000"
```

### 3. Database

```bash
pnpm db:push       # apply schema
pnpm db:generate   # generate Prisma client
```

### 4. Run

```bash
# Terminal 1
pnpm dev

# Terminal 2
pnpm worker
```

---

## Project structure

```
src/
├── app/
│   ├── api/                  # API routes (Next.js App Router)
│   │   ├── health/           # GET /api/health
│   │   ├── repos/            # repository CRUD + GitHub sync
│   │   ├── reviews/          # review reads
│   │   ├── stats/            # metrics aggregation
│   │   └── webhooks/github/  # webhook receiver
│   └── dashboard/            # UI pages
├── lib/
│   ├── ai.ts                 # AI provider factory + callWithFallback
│   ├── auth.ts               # NextAuth config
│   ├── config.ts             # .pr-guardian.yml parsing + defaults
│   ├── embeddings.ts         # pgvector indexing + retrieval
│   ├── github.ts             # Octokit wrappers (diff, comment, status)
│   ├── logger.ts             # structured logger (pino)
│   ├── prisma.ts             # singleton Prisma client
│   ├── queue/
│   │   ├── index.ts          # addReviewJob
│   │   └── worker.ts         # BullMQ processor
│   ├── redis.ts              # ioredis singleton
│   ├── reviewer.ts           # core review pipeline
│   └── __tests__/            # unit tests
└── middleware.ts              # auth protection
```

---

## Testing

```bash
pnpm test              # run all unit tests
pnpm test --watch      # watch mode
pnpm typecheck         # TypeScript check (no emit)
pnpm lint              # ESLint
```

### Writing tests

- Tests live in `src/lib/__tests__/` alongside the code they test.
- Use Vitest. Mock external dependencies with `vi.mock()` — always declare mocks before imports.
- Every new module should have at minimum: a happy path test, a missing-input fallback test, and a test for the case where a dependency throws.
- Do not test implementation details. Test behavior.

---

## Code standards

### TypeScript

- Strict mode is enabled. No `any`, no `@ts-ignore`.
- Use path aliases (`@/lib/...`), never deep relative imports.
- Never import from `@prisma/client` — always from `@/generated/prisma`.

### AI calls

Never call AI providers directly. Always go through `src/lib/ai.ts`:

```typescript
import { callWithFallback } from '@/lib/ai';

const { result, modelId } = await callWithFallback(async (model) => {
  return generateObject({ model, schema, prompt });
});
```

### Logging

Use `logger` from `@/lib/logger`, never `console.log`:

```typescript
import { logger } from '@/lib/logger';
logger.info('Review enqueued', { prNumber, headSha });
```

### API routes

All responses must follow `{ success: true, data: T }` or `{ success: false, error: string }`. Never expose internal error details in responses.

---

## Pull request checklist

Before opening a PR, verify:

- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm test` passes with zero failures
- [ ] `pnpm lint` passes with zero errors
- [ ] New code is covered by unit tests
- [ ] No `console.log` left in committed code
- [ ] No `any` types introduced
- [ ] Commit messages are clear and describe the _why_, not just the _what_

---

## Commit message format

We use conventional commits:

```
type(scope): short description

Longer explanation if needed (wrap at 72 chars).
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`

Examples:

```
feat(reviewer): add incremental re-review on synchronize events
fix(webhook): return 400 for malformed JSON body instead of 500
test(ai): add fallback exhaustion case to callWithFallback suite
docs: update deployment guide for Railway multi-service setup
```

---

## Releasing

Releases are tagged from `main`. Update `CHANGELOG.md` before tagging.
