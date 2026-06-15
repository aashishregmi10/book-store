# Deploying PageTurn Nepal

This is a monorepo with two independently-deployed apps:

- **`frontend/`** — Next.js 16 storefront → Vercel (Next.js preset)
- **`backend/`** — Express 5 API → Vercel (Express "Web Service" preset)

They deploy as **two separate Vercel projects** from the same GitHub repo, each
with its own **Root Directory**. The frontend talks to the backend only over
HTTP (`API_URL` / `NEXT_PUBLIC_API_URL`); it never touches MongoDB directly.

> Note: Socket.io realtime order events are a Phase-2 feature and do not hold
> over Vercel's serverless runtime. The REST API works fully; emit calls are
> guarded with `if (io)` and degrade gracefully, so nothing breaks.

---

## 1. Import the repo on Vercel

Vercel auto-detects both apps and offers to create both projects:

| Project  | Root Directory | Preset            |
| -------- | -------------- | ----------------- |
| frontend | `frontend`     | Next.js           |
| backend  | `backend`      | Express / Web Svc |

You won't know the final domains until after the first deploy, so set what you
can now, deploy, then fill in the cross-references (step 4) and redeploy.

## 2. Backend environment variables

Set these on the **backend** project (copy from `backend/.env.example`):

- `NODE_ENV=production`
- `MONGODB_URI=…`            (MongoDB Atlas connection string)
- `JWT_SECRET=…`            (signs access + refresh tokens)
- `JWT_ACCESS_EXPIRE=…` / `JWT_REFRESH_EXPIRE=…`  (e.g. `15m` / `7d`)
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` (if email is used)
- `REDIS_URL=…` (optional — the app degrades gracefully without it)
- `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` / `INDEXNOW_KEY` (optional)
- `GOOGLE_CLIENT_ID=…` (for Google sign-in — the public Web client ID)
- `NEW_RELIC_LICENSE_KEY=…` / `NEW_RELIC_APP_NAME=PageTurn Nepal API` (optional APM; only runs when `NODE_ENV=production`)
- `FRONTEND_URL=https://<your-frontend-domain>`   ← fill after first deploy
- `PORT` — **do not set**; Vercel injects it (server.js already reads `process.env.PORT`)

`FRONTEND_URL` drives **CORS** (`app.js`) and the **Socket.io** origin, and must
exactly match the deployed frontend origin (no trailing slash).

## 3. Frontend environment variables

Set these on the **frontend** project:

- `NEXT_PUBLIC_SITE_URL=https://<your-frontend-domain>`
- `API_URL=https://<your-backend-domain>/api`            (server-side SSR fetches)
- `NEXT_PUBLIC_API_URL=https://<your-backend-domain>/api` (browser fetches)
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID=…` (public Google Web client ID — must match the backend's `GOOGLE_CLIENT_ID`)
- `NEXT_PUBLIC_GSC_VERIFICATION=…` / `NEXT_PUBLIC_BING_VERIFICATION=…` (optional)

> **Google sign-in in production:** add your deployed frontend domain to the
> OAuth client's **Authorized JavaScript origins** in Google Cloud Console
> (it currently only lists `http://localhost:3000`), or the button won't load.

> Both API vars must include the trailing `/api` — the API client appends paths
> like `/books` directly to this base.

## 4. Wire the two together, then redeploy

After the first deploy gives you both `*.vercel.app` domains:

1. Backend → set `FRONTEND_URL` to the frontend domain → redeploy.
2. Frontend → set `API_URL` + `NEXT_PUBLIC_API_URL` to the backend `/api`,
   and `NEXT_PUBLIC_SITE_URL` to the frontend domain → redeploy.

## 5. Cross-domain auth (already handled in code)

The refresh-token cookie uses `SameSite=None; Secure` in production
(`backend/src/utils/token.js`) so it is sent on cross-site requests from the
frontend to the API. CORS already runs with `credentials: true`. No extra
config needed beyond setting `FRONTEND_URL` correctly.

## 6. Smoke test

- `GET https://<backend>/api/health` → `{ "data": … }`
- Open the frontend home and a book page → content renders (server-rendered).
- Sign up / log in, refresh the page → you stay logged in (confirms the
  cross-domain cookie works).
