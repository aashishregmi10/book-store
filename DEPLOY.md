# Deploying Books Temple Nepal

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
- `CONTACT_EMAIL=…` (where /contact notes are emailed; they are also stored in the DB regardless)
- `INTERNAL_API_KEY=…` (optional but recommended — see the rate-limit note below)

> **Rate limiting and SSR.** The global limiter keys on IP, and the storefront is
> server-rendered, so in production almost every API call arrives from one of
> Vercel's egress addresses — *all shoppers share a single bucket*. The default
> ceiling is deliberately high (2000/15min) for that reason. Setting
> `INTERNAL_API_KEY` to the same value on **both** projects exempts our own
> server-side fetches entirely and is the proper fix. Brute-force protection is
> unaffected either way: it lives on the per-action login/register limiters.

> **Startup validation.** The API now refuses to boot in production if
> `MONGODB_URI`, `JWT_SECRET` or `FRONTEND_URL` is missing, if `JWT_SECRET` is
> under 32 characters or still looks like the placeholder, or if `FRONTEND_URL`
> has a trailing slash. A failed deploy in the logs beats a broken login page.
- `GOOGLE_CLIENT_ID=…` (for Google sign-in — the public Web client ID)
- `NEW_RELIC_LICENSE_KEY=…` / `NEW_RELIC_APP_NAME=Books Temple Nepal API` (optional APM; only runs when `NODE_ENV=production`)
- `FRONTEND_URL=https://<your-frontend-domain>`   ← fill after first deploy
- `PORT` — **do not set**; Vercel injects it (server.js already reads `process.env.PORT`)

`FRONTEND_URL` drives **CORS** (`app.js`) and the **Socket.io** origin, and each
entry must exactly match a deployed frontend origin (no trailing slash).

> **Custom domain?** `FRONTEND_URL` accepts a comma-separated list, e.g.
> `https://www.bookstemple.com,https://book-store-tawny-two.vercel.app`. This
> matters because Vercel keeps the project's default `*.vercel.app` URL live
> alongside a newly attached custom domain — if `FRONTEND_URL` only names one
> of them, the API rejects CORS requests (and Google Sign-In) from the other.
> The **first** entry is canonical: it's what emails, the sitemap, the
> merchant feed and IndexNow use to build links, so list the real domain
> first. Update it — and redeploy the backend — the same day you attach a
> custom domain, not after.

## 3. Frontend environment variables

Set these on the **frontend** project:

- `NEXT_PUBLIC_SITE_URL=https://<your-frontend-domain>`
- `NEXT_PUBLIC_IMAGE_HOST=https://images.bookstemple.com` (Production; used for R2 cover URLs in the Google Merchant feed)
- `API_URL=https://<your-backend-domain>/api`            (server-side SSR fetches)
- `NEXT_PUBLIC_API_URL=https://<your-backend-domain>/api` (browser fetches)
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID=…` (public Google Web client ID — must match the backend's `GOOGLE_CLIENT_ID`)
- `NEXT_PUBLIC_GSC_VERIFICATION=…` / `NEXT_PUBLIC_BING_VERIFICATION=…` (optional)
- `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-…` (optional — the live GA4 ID is the built-in default; see below)
- `NEXT_PUBLIC_CONTACT_PHONE=+977…` (optional; the /contact phone row stays hidden while unset rather than showing a number that doesn't work)
- `INTERNAL_API_KEY=…` (optional; must match the backend's value — note: **no** `NEXT_PUBLIC_` prefix, it must not reach the browser)

> **Analytics:** the GA4 measurement ID is hardcoded in
> `components/Analytics.tsx` — it is public (it ships in the HTML of every
> page), and leaving it to a dashboard field meant one forgotten entry silently
> produced no analytics at all. **No env var is needed for GA to work.**
>
> `npm run dev` never reports, so local work stays out of the property. Preview
> deploys build with `NODE_ENV=production` and *do* report — set
> `NEXT_PUBLIC_GA_MEASUREMENT_ID` to an **empty string** on Vercel's *Preview*
> environment to exclude them. Set it to a different `G-…` to point an
> environment at another property.

> **Google sign-in in production:** add your deployed frontend domain to the
> OAuth client's **Authorized JavaScript origins** in Google Cloud Console
> (it currently only lists `http://localhost:3000`), or the button won't load.

> Both API vars must include the trailing `/api` — the API client appends paths
> like `/books` directly to this base.
>
> Set `NEXT_PUBLIC_IMAGE_HOST` in the frontend project's **Production**
> environment and redeploy. It only changes the host for R2 `/covers/*.webp`
> links in the Merchant feed; Cloudinary and other image hosts are unchanged.

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
