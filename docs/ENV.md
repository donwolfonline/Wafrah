# Wafrah Environment Variables Reference

Wafrah validates all environment variables at startup using Zod schemas in [src/env.ts](file:///Users/frederickdineen/wafrah/src/env.ts) (server + combined validation) and [src/env.client.ts](file:///Users/frederickdineen/wafrah/src/env.client.ts) (browser-safe `NEXT_PUBLIC_*` subset).

> [!CAUTION]
> **Strict Isolation Rule:** **Preview** and **Development** environments must **NEVER** use the production PostgreSQL database (`DATABASE_URL` / `DIRECT_URL`) or production API keys and signing secrets (`RESEND_API_KEY`, `AUTH_SECRET`, `CRON_SECRET`). Always provision separate staging/development databases and distinct secrets per environment.

---

## Startup Validation & Server/Client Separation

- **Server-only (`src/env.ts`):** Contains database credentials, signing secrets, email API keys, cron tokens, and deployment metadata. Importing `src/env.ts` in browser code throws immediately.
- **Public (`src/env.client.ts`):** Reads only `NEXT_PUBLIC_*` variables inlined into client bundles at build time.
- **Fail-fast behavior in Production:** When `VERCEL_ENV === "production"` (or runtime `NODE_ENV === "production"` outside local builds), missing, short, placeholder, or malformed required variables throw immediately on startup listing **only** the offending variable names (never their values).

---

## Generating Cryptographic Secrets

Run these commands locally before setting Vercel **Project Settings -> Environment Variables**:

```bash
# 1) AUTH_SECRET (>= 32 characters, base64) — generate distinct values per environment
openssl rand -base64 32

# 2) CRON_SECRET (>= 16 characters; 64-char hex recommended) — generate distinct values per environment
openssl rand -hex 32

# 3) One-time ADMIN_PASSWORD for CLI `pnpm db:seed:prod` (`prisma/seed.production.ts`; never save in Vercel)
openssl rand -base64 24
```

---

## Configured Variables

| Variable | Scope | Purpose & Validation Rule | Production | Preview | Development |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Server | Pooled runtime PostgreSQL connection URL (`postgresql://...`; non-localhost in Vercel prod/preview) | **Required** | **Required** *(staging DB)* | **Required** *(local DB)* |
| `DIRECT_URL` | CLI / CI Only | Direct unpooled PostgreSQL URL used **only** for deliberate `pnpm db:migrate:deploy`, `prisma validate`, and `pnpm db:seed:prod` (not required in Vercel runtime) | **CLI / CI Required** | **CLI / CI** *(staging direct)* | **Required** *(same as local DB)* |
| `AUTH_SECRET` | Server | Auth.js JWE session encryption/signing secret (`>= 32` chars; rejects placeholders & dev strings in prod/preview). Rotating invalidates all active sessions immediately. | **Required** (`openssl rand -base64 32`) | **Required** *(separate secret)* | Required for auth |
| `APP_URL` | Server | Canonical app origin for cookies, redirects, and email links (`https://...` in Vercel prod) | **Required** | Omit *(uses `VERCEL_URL`)* | Recommended (`http://localhost:3000`) |
| `NEXT_PUBLIC_SITE_URL` | Client (`NEXT_PUBLIC`) | Single canonical public origin for metadata, `sitemap.xml`, `robots.txt`, canonical/`hreflang`/OG tags, and permanent `www` <-> apex host redirect (`https://...` in Vercel prod) | **Required** | Omit *(uses `VERCEL_URL`)* | Optional |
| `NEXT_PUBLIC_APP_URL` | Client (`NEXT_PUBLIC`) | Optional fallback app origin used by staff setup origin resolution | Optional | Optional | Optional |
| `AUTH_URL` | Server | Optional legacy Auth.js URL override (never set on Preview) | Optional | **Do not set** | Optional |
| `AUTH_TRUST_HOST` | Server | `"true"` (default via `shouldTrustAuthHost`) or `"false"` to opt out of reverse-proxy host trust | Optional *(defaults `true`)* | Optional *(defaults `true`)* | Optional |
| `RESEND_API_KEY` | Server | Resend HTTP API key (`re_...`, non-placeholder in prod; omitted on Preview uses console email) | **Required** | **Never production key** *(omit for console email or test key)* | Optional *(console preview)* |
| `EMAIL_FROM` | Server | Verified Resend sender (`Name <addr@domain>` or email; defaults to `Wafrah <notifications@wafrah.sa>`) | Recommended | Optional | Optional |
| `CRON_SECRET` | Server | Shared bearer token (`Authorization: Bearer`) checked on `/api/cron/*` and `/api/health/deep` (`>= 16` chars; returns `500` when unset) | **Required** (`openssl rand -hex 32`) | **Never set (Omit)** | Optional |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Client (`NEXT_PUBLIC`) | WhatsApp Business digits without `+` (`8–15` digits, e.g. `9665XXXXXXXX`) for public/lead CTAs | **Required** | Optional *(test number)* | Optional |
| `FOUNDER_EMAIL` | Server | Destination inbox for `POST /api/leads` pilot notifications | **Required** | Optional *(dev inbox)* | Optional |
| `NEXT_PUBLIC_ANALYTICS_PROVIDER` | Client (`NEXT_PUBLIC`) | Optional non-PII analytics provider slug (e.g. `plausible`, `ga4`); empty disables tracking | Optional | Optional | Optional |
| `SKIP_MIGRATE_DEPLOY` | Server | Legacy flag (ignored — [vercel-build.mjs](file:///Users/frederickdineen/wafrah/scripts/vercel-build.mjs) never auto-runs database migrations on Preview or Production builds) | Omit | Omit | Optional |
| `WAFRAH_BUILD_ID` | Server | Optional override for Next.js build ID and `/sw.js` cache version | Optional *(auto)* | Optional *(auto)* | Optional |
| `NEXT_DIST_DIR` | Server | Optional custom Next.js build output directory for isolated local builds | Optional | Optional | Optional |
| `SUPPORT_CONTACT_NAME` | Server | Optional pilot support contact display name shown on `/help` | Optional | Optional | Optional |
| `SUPPORT_CONTACT_EMAIL` | Server | Optional pilot support contact email shown on `/help` | Optional | Optional | Optional |
| `SUPPORT_CONTACT_PHONE` | Server | Optional pilot support phone shown on `/help` | Optional | Optional | Optional |
| `SUPPORT_WHATSAPP_URL` | Server | Optional `https://wa.me/...` link shown on `/help` | Optional | Optional | Optional |
| `ADMIN_EMAIL` | CLI only | Platform Admin email for one-time `pnpm db:seed:prod` ([seed.production.ts](file:///Users/frederickdineen/wafrah/prisma/seed.production.ts)) | **CLI only — do not store in Vercel** | **CLI only** | Optional |
| `ADMIN_PASSWORD` | CLI only | Strong 12+ char password for `pnpm db:seed:prod` (never logged) | **CLI only — do not store in Vercel** | **CLI only** | Optional |
| `ADMIN_NAME` | CLI only | Optional Platform Admin display name (`Wafrah Platform Admin` default) | CLI only | CLI only | Optional |
| `ADMIN_USERNAME` | CLI only | Optional Platform Admin username (`platform-admin` default) | CLI only | CLI only | Optional |
| `ADMIN_LOCALE` | CLI only | `"ar"` (default) or `"en"` for initial Platform Admin UI | CLI only | CLI only | Optional |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Tooling | Local browser executable path used by `pnpm og:generate` | Unused | Unused | Optional |
| `LANDING_SCREENSHOT_DIR`, `QA_SCREENSHOT_DIR`, `ADMIN_SCREENSHOT_DIR` | Tooling | Local output directories for Playwright QA screenshot specs (`e2e/*.spec.ts`) | Unused | Unused | Optional |

---

## Platform & Framework-Managed Variables (Do Not Configure Manually)

| Variable | Provided By | Role |
| :--- | :--- | :--- |
| `NODE_ENV` | Next.js / Node.js | `"development"`, `"test"`, or `"production"`. **Never add `NODE_ENV=production` manually in Vercel**, as it causes `pnpm install` to skip `devDependencies` needed for the build. |
| `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | Vercel Runtime | Identify Vercel deployment tier and dynamic hostnames (`app-url.ts`). |
| `VERCEL_GIT_COMMIT_SHA`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_REGION` | Vercel Runtime | Used internally for `/sw.js` cache build ID resolution and structured logs (`/api/health` omits runtime internals). |
| `NEXT_PHASE`, `NEXT_RUNTIME` | Next.js | Internal build/runtime phase markers used to distinguish local `next build` from live server boot. |
| `CI` | CI / GitHub Actions | Configures Playwright retry/forbid-only defaults in [playwright.config.ts](file:///Users/frederickdineen/wafrah/playwright.config.ts). |
| `USER`, `LOGNAME` | OS Shell | Local PostgreSQL URL username fallback when running without an explicit DB username. |

---

## `AUTH_SECRET` Rotation Behavior

Per the [Auth.js v5 Deployment docs](https://authjs.dev/getting-started/deployment) and `@auth/core` JWE encryption (`dir` + `A256CBC-HS512`, key derived from `AUTH_SECRET` via HKDF with a key-thumbprint `kid`):

- **Immediate global sign-out:** Replacing `AUTH_SECRET` in Vercel Environment Variables and redeploying immediately invalidates every active session cookie (`__Secure-authjs.session-token` / `authjs.session-token`). Any user clicking a protected route (`/dashboard`, `/log`, `/admin`, etc.) fails JWE decryption, has their stale cookie cleared by [proxy.ts](file:///Users/frederickdineen/wafrah/src/proxy.ts), and is redirected to `/login?reason=expired`.
- **Offline kitchen queues remain safe:** Offline waste logs stored in browser IndexedDB by staff on `/log` stay on the device until the kitchen tablet signs back in with its 4-digit PIN, then sync normally.
- **When to rotate:** Schedule planned rotations after restaurant closing hours (`05:00` Riyadh changeover), or rotate immediately without waiting in case of secret exposure to revoke all active tokens.
