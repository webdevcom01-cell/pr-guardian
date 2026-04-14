# Deployment Guide

This guide covers deploying PR Guardian to Railway with two services: a web service (Next.js) and a worker service (BullMQ). Railway is the recommended platform; the app will also run on any host that supports Node.js 20+ and can connect to PostgreSQL and Redis.

---

## Prerequisites

- A [Railway](https://railway.app) account
- A GitHub account with permission to create OAuth Apps
- At least one AI provider API key (DeepSeek, OpenAI, or Anthropic)

---

## Step 1 — Create a GitHub OAuth App

1. Go to [github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**
2. Fill in:
   - **Application name:** PR Guardian
   - **Homepage URL:** `https://your-app.up.railway.app` (update after Railway assigns URL)
   - **Authorization callback URL:** `https://your-app.up.railway.app/api/auth/callback/github`
3. Click **Register application**
4. On the next screen, copy the **Client ID**
5. Click **Generate a new client secret** and copy it

> You will update the callback URL once Railway assigns your domain.

---

## Step 2 — Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Select **Deploy from GitHub repo**
3. Connect your GitHub account if prompted, then select your fork of `pr-guardian`
4. Railway will detect `railway.json` and start the first deploy

---

## Step 3 — Add PostgreSQL

1. In your Railway project → **+ New Service → Database → PostgreSQL**
2. Click on the Postgres service → **Variables** tab
3. Copy the `DATABASE_URL` value

---

## Step 4 — Add Redis

1. **+ New Service → Database → Redis**
2. Click on the Redis service → **Variables** tab
3. Copy the `REDIS_URL` value

---

## Step 5 — Configure web service environment variables

Click on your web service → **Variables** tab → **Add Variable**. Add each of these:

| Variable | Value |
|---|---|
| `DATABASE_URL` | From Railway Postgres service |
| `DIRECT_URL` | Same as `DATABASE_URL` |
| `AUTH_SECRET` | Run `openssl rand -base64 32` locally and paste the result |
| `AUTH_GITHUB_ID` | OAuth App Client ID from Step 1 |
| `AUTH_GITHUB_SECRET` | OAuth App Client Secret from Step 1 |
| `DEEPSEEK_API_KEY` | Your DeepSeek API key (or use OpenAI/Anthropic below) |
| `OPENAI_API_KEY` | *(optional)* OpenAI API key — used as fallback |
| `ANTHROPIC_API_KEY` | *(optional)* Anthropic API key — used as last fallback |
| `REDIS_URL` | From Railway Redis service |
| `NEXTAUTH_URL` | `https://your-app.up.railway.app` (from Railway → your service → Settings → Domain) |
| `APP_URL` | Same as `NEXTAUTH_URL` |

---

## Step 6 — Create the worker service

The BullMQ worker must run as a **separate Railway service** so it can restart independently from the web server.

1. In your Railway project → **+ New Service → GitHub Repo**
2. Select the same `pr-guardian` repository
3. Railway will create a second service — click on it → **Settings**
4. Set **Start Command** to: `pnpm run start:worker`
5. Go to **Variables** → **Add Reference** and add the same variables as the web service:
   - `DATABASE_URL`, `DIRECT_URL`
   - `DEEPSEEK_API_KEY` (and/or `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
   - `REDIS_URL`
   - `APP_URL`

> The worker does not need `AUTH_*`, `NEXTAUTH_URL`, or any OAuth variables.

---

## Step 7 — Initialize the database

The web service start command (`pnpm run start:railway`) runs `prisma db push` automatically on every deploy. No manual migration step is needed.

If you want to run it manually:

```bash
# From your local machine with DATABASE_URL set in .env.local
pnpm db:push
pnpm db:generate
```

---

## Step 8 — Update GitHub OAuth callback URL

After Railway assigns your domain:

1. Go back to your GitHub OAuth App → **Edit**
2. Update **Homepage URL** to your Railway app URL
3. Update **Authorization callback URL** to `https://your-app.up.railway.app/api/auth/callback/github`
4. Save

---

## Step 9 — Verify deployment

1. Open your Railway app URL in a browser
2. Click **Sign in with GitHub** — you should be redirected to GitHub and back
3. Go to **Repositories** → **Connect a Repository**
4. Select a repository — PR Guardian will install the webhook automatically
5. Open a pull request in that repository
6. Within ~30 seconds, a review comment should appear on the PR and a commit status check should be set

---

## Local development

```bash
# Install dependencies
pnpm install

# Copy and fill in environment variables
cp .env.example .env.local

# Set up database
pnpm db:push
pnpm db:generate

# Start web server (Terminal 1)
pnpm dev

# Start worker (Terminal 2)
pnpm worker
```

To test webhooks locally, expose your local server with ngrok:

```bash
npx ngrok http 3000
```

Set `APP_URL` and `NEXTAUTH_URL` to the ngrok URL in `.env.local`, then connect a repository — PR Guardian will install the webhook pointing to your ngrok tunnel.

---

## Environment variable reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `DIRECT_URL` | ✅ | Same as `DATABASE_URL` (for Prisma migrations) |
| `AUTH_SECRET` | ✅ | NextAuth session signing secret |
| `AUTH_GITHUB_ID` | ✅ | GitHub OAuth App client ID |
| `AUTH_GITHUB_SECRET` | ✅ | GitHub OAuth App client secret |
| `NEXTAUTH_URL` | ✅ | Full URL of the app (used by NextAuth) |
| `APP_URL` | ✅ | Full URL of the app (used in review comments and status links) |
| `REDIS_URL` | ✅ | Redis connection string |
| `DEEPSEEK_API_KEY` | ⚠️ one required | DeepSeek API key |
| `OPENAI_API_KEY` | ⚠️ one required | OpenAI API key |
| `ANTHROPIC_API_KEY` | ⚠️ one required | Anthropic API key |

At least one of `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` must be set. Multiple keys enable automatic fallback if the primary provider fails.

---

## Troubleshooting

**Reviews are not being posted**
- Check the worker service logs in Railway — the worker process must be running
- Verify `REDIS_URL` is the same in both web and worker services
- Check that the BullMQ job was enqueued by looking at web service logs for `Review job enqueued`

**Webhook signature errors (401)**
- The webhook secret is generated when the repository is connected — reconnect the repository if you suspect the secret is wrong
- Make sure the raw body is being read before parsing (the code reads `req.text()`, not `req.json()`)

**GitHub OAuth callback mismatch**
- The callback URL in your GitHub OAuth App must exactly match `{APP_URL}/api/auth/callback/github`

**Database connection errors**
- Confirm `DATABASE_URL` is set correctly in Railway Variables — use the internal Railway URL (`postgres.railway.internal`) when possible for lower latency and no egress cost
