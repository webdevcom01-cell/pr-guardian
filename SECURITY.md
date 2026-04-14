# Security Policy

## Supported versions

Only the latest release on `main` receives security fixes.

| Version | Supported |
|---------|-----------|
| 0.1.x (latest) | ✅ |
| older | ❌ |

---

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Send a report to: **security@your-domain.com**

Include as much of the following as you can:

- Description of the vulnerability and its potential impact
- Steps to reproduce (proof of concept if possible)
- Affected version(s) and components
- Any suggested mitigations

You will receive an acknowledgement within 48 hours. We aim to release a fix within 14 days for critical issues, and within 30 days for others. We will credit you in the changelog unless you request otherwise.

---

## Security design

### Webhook verification

Every incoming GitHub webhook is verified with HMAC-SHA256 before any processing occurs. The signature is compared using `crypto.timingSafeEqual` to prevent timing attacks. Requests with invalid, missing, or malformed signatures receive a `401` response immediately.

### Authentication

- GitHub OAuth is used exclusively — no password storage.
- Sessions are JWT-based (NextAuth v5), signed with `AUTH_SECRET`.
- All dashboard routes and API endpoints require an authenticated session. Public paths are explicitly allowlisted in `src/middleware.ts`.

### GitHub token scope

PR Guardian requests the minimum OAuth scopes required:

| Scope | Reason |
|---|---|
| `read:user` | Read GitHub profile |
| `user:email` | Read primary email |
| `public_repo` | Post review comments on public repositories |
| `admin:repo_hook` | Create and delete webhooks |
| `repo:status` | Post commit status checks |

Users who need to review private repositories can optionally grant the full `repo` scope.

### Secrets

- Webhook secrets are generated per-repository using a cryptographically random value and stored in the database.
- GitHub tokens are stored in the database associated with the user record and are never returned to the client via API responses.
- All secrets are accessed server-side only.

### Rate limiting

Webhook processing is rate-limited to 10 events per repository per hour using Redis. Requests exceeding the limit receive a `429` response. This limit applies even if the signature is valid, to prevent abuse of the AI processing pipeline.

### Input validation

All API inputs are validated with Zod before processing. Malformed JSON bodies return `400`. Unknown or unsupported webhook event types are silently ignored with a `200 { ignored: true }` response.

### Database

- All database access goes through Prisma with parameterized queries — no raw string concatenation.
- Cascade deletes are configured: removing a repository removes all associated pull requests and reviews.

---

## Dependency security

Run `pnpm audit` to check for known vulnerabilities in dependencies. We recommend reviewing the output before every deployment.
