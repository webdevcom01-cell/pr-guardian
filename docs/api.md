# API Reference

All endpoints return JSON. Success responses use `{ success: true, data: T }`. Error responses use `{ success: false, error: string }` with an appropriate HTTP status code.

Authentication is required for all endpoints except where noted. Session cookies are used (NextAuth v5 JWT).

---

## Health

### `GET /api/health`

Public. Returns service health status.

**Response `200`**
```json
{
  "status": "ok",
  "timestamp": "2026-04-14T12:00:00.000Z"
}
```

---

## Repositories

### `GET /api/repos`

Returns all repositories connected by the authenticated user.

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "githubId": 12345,
      "fullName": "acme/api",
      "description": "Backend API",
      "isActive": true,
      "webhookId": 67890,
      "createdAt": "2026-04-01T10:00:00.000Z",
      "_count": { "pullRequests": 14 }
    }
  ]
}
```

---

### `POST /api/repos`

Connect a GitHub repository. Installs a webhook automatically.

**Request body**
```json
{
  "githubId": 12345,
  "fullName": "acme/api",
  "description": "Backend API"
}
```

**Response `201`**
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "fullName": "acme/api",
    "isActive": true
  }
}
```

**Errors**
| Status | Reason |
|---|---|
| `409` | Repository already connected |
| `422` | Invalid request body |

---

### `GET /api/repos/github`

Returns the authenticated user's GitHub repositories available for connection (fetched from GitHub API).

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "id": 12345,
      "full_name": "acme/api",
      "description": "Backend API",
      "private": false
    }
  ]
}
```

---

### `GET /api/repos/[id]`

Returns a single connected repository with recent pull requests and reviews.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "fullName": "acme/api",
    "isActive": true,
    "pullRequests": [
      {
        "id": "clx...",
        "prNumber": 42,
        "title": "Add authentication middleware",
        "author": "dev",
        "headSha": "abc123",
        "prUrl": "https://github.com/acme/api/pull/42",
        "reviews": [
          {
            "id": "clx...",
            "decision": "APPROVE",
            "compositeScore": 88,
            "createdAt": "2026-04-14T11:30:00.000Z"
          }
        ]
      }
    ]
  }
}
```

---

### `DELETE /api/repos/[id]`

Disconnect a repository. Removes the webhook from GitHub and deletes all associated data.

**Response `200`**
```json
{ "success": true, "data": { "deleted": true } }
```

---

## Reviews

### `GET /api/reviews`

Returns recent reviews for the authenticated user across all repositories.

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | number | `20` | Number of reviews to return (max 100) |
| `offset` | number | `0` | Pagination offset |

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "decision": "BLOCK",
      "compositeScore": 32,
      "securityScore": 15,
      "qualityScore": 49,
      "summary": "Critical SQL injection vulnerability detected.",
      "modelUsed": "deepseek-chat",
      "durationMs": 4821,
      "createdAt": "2026-04-14T11:30:00.000Z",
      "pullRequest": {
        "prNumber": 42,
        "title": "Add user search",
        "prUrl": "https://github.com/acme/api/pull/42",
        "repo": { "fullName": "acme/api" }
      }
    }
  ]
}
```

---

### `GET /api/reviews/[id]`

Returns a single review with full issue list.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "decision": "BLOCK",
    "compositeScore": 32,
    "securityScore": 15,
    "qualityScore": 49,
    "issues": [
      {
        "severity": "CRITICAL",
        "category": "security",
        "file": "src/db/users.ts",
        "line": 24,
        "message": "SQL injection via unparameterized query",
        "fix": "Use parameterized queries: db.query('SELECT * FROM users WHERE id = $1', [id])"
      }
    ],
    "summary": "Critical SQL injection vulnerability detected.",
    "modelUsed": "deepseek-chat",
    "durationMs": 4821,
    "githubCommentId": 1234567890,
    "createdAt": "2026-04-14T11:30:00.000Z"
  }
}
```

---

## Stats

### `GET /api/stats`

Returns aggregated review metrics for the authenticated user.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "totalReviews": 142,
    "avgScore": 76.4,
    "avgDurationMs": 5230,
    "decisionBreakdown": {
      "APPROVE": 98,
      "APPROVE_WITH_NOTES": 31,
      "BLOCK": 13
    },
    "scoreDistribution": {
      "90-100": 44,
      "70-89": 61,
      "50-69": 28,
      "0-49": 9
    },
    "topCategories": [
      { "category": "security", "count": 38 },
      { "category": "quality", "count": 27 }
    ],
    "last30Days": [
      { "date": "2026-03-16", "count": 3 },
      { "date": "2026-03-17", "count": 0 }
    ],
    "scoreTrend": [76, 78, 74, 80, 82],
    "repoTable": [
      {
        "fullName": "acme/api",
        "total": 67,
        "avgScore": 79.1,
        "blocked": 5,
        "blockRate": 7.5
      }
    ]
  }
}
```

---

## Webhooks

### `POST /api/webhooks/github`

Public (verified by HMAC-SHA256). Receives GitHub webhook events.

This endpoint is called by GitHub automatically — you do not call it directly.

**Required headers**

| Header | Description |
|---|---|
| `x-github-event` | Event type (only `pull_request` is processed) |
| `x-hub-signature-256` | HMAC-SHA256 signature of the raw body |
| `x-github-delivery` | GitHub delivery UUID |

**Possible responses**

| Status | Body | Meaning |
|---|---|---|
| `200` | `{ ignored: true, event: "push" }` | Non-PR event |
| `200` | `{ ignored: true, reason: "labeled" }` | Unsupported PR action |
| `200` | `{ ignored: true, reason: "repo not connected" }` | Unknown repository |
| `200` | `{ ignored: true, reason: "review already exists" }` | Duplicate |
| `200` | `{ queued: true }` | Job enqueued successfully |
| `400` | `{ error: "Invalid JSON" }` | Malformed body |
| `401` | `{ error: "Invalid signature" }` | HMAC mismatch |
| `429` | `{ error: "Rate limit exceeded" }` | Too many events |
| `500` | `{ error: "Internal server error" }` | Processing failed |
