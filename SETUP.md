# PR Guardian — Setup Guide

## ✅ Status
- GitHub repo: https://github.com/webdevcom01-cell/pr-guardian
- Code: pushed and ready

---

## Step 1 — Install dependencies (local dev)

```bash
cd ~/Desktop/pr-guardian
pnpm install        # or: npm install
```

---

## Step 2 — Create GitHub OAuth App

1. Go to: https://github.com/settings/developers
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name:** PR Guardian
   - **Homepage URL:** http://localhost:3000
   - **Authorization callback URL:** http://localhost:3000/api/auth/callback/github
4. Click **Register application**
5. Copy **Client ID** and generate **Client Secret**

---

## Step 3 — Create GitHub Personal Access Token

1. Go to: https://github.com/settings/tokens/new
2. Select scopes: `repo` (full repo access for webhook + PR comments)
3. Click **Generate token**
4. Copy the token (starts with `ghp_`)

---

## Step 4 — Local .env setup

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
DATABASE_URL="postgresql://..."        # from Railway (Step 6)
DIRECT_URL="postgresql://..."          # same as DATABASE_URL for now
AUTH_SECRET="run: openssl rand -base64 32"
AUTH_GITHUB_ID="your-client-id"
AUTH_GITHUB_SECRET="your-client-secret"
GITHUB_TOKEN="ghp_..."
ANTHROPIC_API_KEY="sk-ant-..."
REDIS_URL="redis://..."                # from Railway (Step 6)
NEXTAUTH_URL="http://localhost:3000"
APP_URL="http://localhost:3000"
```

---

## Step 5 — Deploy to Railway

### 5a. Create Railway project
1. Go to https://railway.app → **New Project**
2. Choose **Deploy from GitHub repo**
3. Select `webdevcom01-cell/pr-guardian`
4. Railway auto-detects Next.js ✅

### 5b. Add PostgreSQL
1. In your Railway project → **+ New Service**
2. Choose **Database → PostgreSQL**
3. Click on Postgres service → **Variables** tab
4. Copy `DATABASE_URL` → paste into your app's Variables

### 5c. Add Redis
1. **+ New Service → Database → Redis**
2. Copy `REDIS_URL` → paste into your app's Variables

### 5d. Set environment variables
In Railway → your app service → **Variables** tab, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | from Postgres service |
| `DIRECT_URL` | same as DATABASE_URL |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GITHUB_ID` | from Step 2 |
| `AUTH_GITHUB_SECRET` | from Step 2 |
| `GITHUB_TOKEN` | from Step 3 |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `REDIS_URL` | from Redis service |
| `NEXTAUTH_URL` | your Railway app URL (e.g. https://pr-guardian.up.railway.app) |
| `APP_URL` | same as NEXTAUTH_URL |

### 5e. Update GitHub OAuth callback URL
After Railway assigns your URL:
1. Go back to your GitHub OAuth App settings
2. Update **Authorization callback URL** to:
   `https://your-app.up.railway.app/api/auth/callback/github`

---

## Step 6 — Initialize database

```bash
# After setting DATABASE_URL in .env.local:
pnpm db:push       # pushes schema to Railway PostgreSQL
pnpm db:generate   # generates Prisma client
```

---

## Step 7 — Run locally

```bash
pnpm dev
```

Open http://localhost:3000 → Sign in with GitHub → Connect a repo → Open a PR!

---

## Step 8 — Test webhook locally (optional)

Use ngrok to expose localhost for GitHub webhooks during development:

```bash
npx ngrok http 3000
```

Set `APP_URL=https://xxxx.ngrok.io` in `.env.local` when connecting repos locally.

---

## Architecture

```
GitHub PR opened
      ↓
POST /api/webhooks/github
      ↓ (HMAC verified)
BullMQ job enqueued
      ↓
Worker: fetch diff → AI review → post GitHub comment
      ↓
Review saved to PostgreSQL
      ↓
Dashboard updated ✅
```

---

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm worker       # Start BullMQ worker (separate process)
pnpm db:push      # Sync schema to DB
pnpm db:generate  # Regenerate Prisma client
pnpm db:studio    # Prisma Studio (DB browser)
```
