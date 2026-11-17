# Wafrah — Production Deployment & Operations Runbook

> **Operator Note:** Never run deployment commands hastily against production or use `prisma migrate dev` / `prisma db push` / `pnpm db:seed` against cloud databases. Read [docs/ENV.md](docs/ENV.md), [docs/DB-OPS.md](docs/DB-OPS.md), and [docs/STAGING.md](docs/STAGING.md) before making live changes.

---

## 1. Prerequisites

Create these accounts and verify local tooling before starting:

1. **GitHub** (`https://github.com/donwolfonline/Wafrah.git`): hosts source code and runs `.github/workflows/ci.yml` and `.github/workflows/e2e-staging.yml`.
2. **Vercel Pro** ([Vercel Pricing](https://vercel.com/pricing)): **Vercel Hobby is prohibited for commercial use.** Under [Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines), business sites, SaaS pilots, and commercial lead capture require Pro (Hobby also restricts cron schedules to once daily with +/-59m drift).
3. **Managed PostgreSQL (`eu-central-1` Frankfurt)**: **Neon Launch** ([neon.com/pricing](https://neon.com/pricing), recommended for pilot 7-day PITR) or **Supabase Pro** ([supabase.com/pricing](https://supabase.com/pricing)). See Section 10 and [docs/DB-OPS.md](docs/DB-OPS.md) if Saudi legal counsel requires in-Kingdom (`me-central2`) residency.
4. **Resend** ([resend.com/pricing](https://resend.com/pricing)): transactional email API + custom domain DNS verification.
5. **`.sa` Domain Registrar**: register `wafrah.sa` via a SaudiNIC-accredited registrar ([nic.sa](https://nic.sa/); requires Saudi Commercial Registration or Nafath verification).
6. **Operator Machine**: Node `22.x`, `pnpm@12.18.0` (`corepack enable`), and PostgreSQL 16+ client tools (`pg_dump`, `pg_restore`, `psql`).

---

## 2. First Deployment

1. **Push Code & Protect `main`:** Push `main` to GitHub, then enable branch protection on `main` following [docs/STAGING.md](docs/STAGING.md) (require PR + `ci.yml` checks passing; block direct pushes and force pushes).
2. **Create Staging & Production Databases First:** Provision two separate PostgreSQL projects/databases (`wafrah-prod` and `wafrah-staging` — never share databases between Production and Preview).
3. **Import Project in Vercel:**
   - Vercel Dashboard -> **Add New... -> Project** -> import `donwolfonline/Wafrah`.
   - **Framework Preset:** `Next.js`.
   - **Build & Output Settings:** leave Install empty (`pnpm install` runs `postinstall: prisma generate`); `vercel.json` overrides Build Command to `pnpm run vercel-build` (runs `prisma generate` + `next build --webpack`, never auto-running migrations).
   - **Node.js Version:** Project **Settings -> Build and Deployment -> Node.js Version -> `22.x`** (matches `package.json`).
   - **Function Region:** Project **Settings -> Functions -> Function Region -> Frankfurt, Germany (`fra1`)** (matches `regions: ["fra1"]` in `vercel.json` and `eu-central-1` DB; see [Vercel Regions](https://vercel.com/docs/regions) and the `dxb1` March 2026 caveat in [docs/DB-OPS.md](docs/DB-OPS.md)).
4. **Configure Environment Variables (Production vs Preview):**
   - Generate secrets locally: `openssl rand -base64 32` (`AUTH_SECRET`) and `openssl rand -hex 32` (`CRON_SECRET`, Production only).
   - Enter Production and Preview variables per [docs/ENV.md](docs/ENV.md) and [docs/STAGING.md](docs/STAGING.md):
     - **Production scope:** `DATABASE_URL` (pooled), `AUTH_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `FOUNDER_EMAIL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, plus temporary `APP_URL` and `NEXT_PUBLIC_SITE_URL` set to your initial `https://<project>.vercel.app` domain (updated to `https://wafrah.sa` in Section 4).
     - **Preview scope:** **only** staging `DATABASE_URL`, a distinct staging `AUTH_SECRET`, staging `EMAIL_FROM` / `FOUNDER_EMAIL`, and `NEXT_PUBLIC_WHATSAPP_NUMBER`. **Never** add `CRON_SECRET` or live `RESEND_API_KEY` to Preview.
5. **First Deploy:** Click **Deploy** and confirm build logs print `VERCEL_BUILD_MIGRATIONS_DISABLED` and finish green.

---

## 3. Production Database Setup

Run schema migrations and admin bootstrap from your machine against the Production **direct (unpooled)** URL before promoting live customer traffic. Never attach `DIRECT_URL` or `ADMIN_PASSWORD` inside Vercel runtime env vars.

1. **Apply Migrations to Production:**

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/wafrah_prod?sslmode=require"
export DIRECT_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/wafrah_prod?sslmode=require"
pnpm db:migrate:deploy
pnpm exec prisma migrate status
```

Confirm `Database schema is up to date!`. Future changes must follow **Expand, Deploy, Contract** in [docs/DB-OPS.md](docs/DB-OPS.md).

2. **Bootstrap Only `PLATFORM_ADMIN`:** Never run `pnpm db:seed` (demo restaurants) in Production. Provide a strong password (`>= 12` chars with uppercase, lowercase, and a digit or symbol):

```bash
export ADMIN_EMAIL="admin@wafrah.sa"
export ADMIN_PASSWORD="REPLACE_WITH_STRONG_UNIQUE_PASSWORD"
pnpm db:seed:prod
unset ADMIN_PASSWORD DIRECT_URL DATABASE_URL
```

3. **Verify Deep Health Endpoint:**

```bash
curl -i -H "Authorization: Bearer REPLACE_WITH_CRON_SECRET" \
  https://<your-vercel-domain>/api/health/deep
```

- Expected **right after first deploy:** `checks.db.status` is `"up"`, while `checks.cron.status` is `"missing"` (HTTP `503`) until `/api/cron/daily` runs its first execution.
- After running `/api/cron/daily` in Section 5, re-run this curl and verify HTTP `200` with `"status":"ok"`.

---

## 4. Custom Domain, DNS & TLS

1. **Add Domains in Vercel:** Project **Settings -> Domains -> Add**: add `wafrah.sa` and `www.wafrah.sa`. Choose `wafrah.sa` as Primary (permanent `308` redirects from `www.wafrah.sa` -> `https://wafrah.sa` are driven automatically by `NEXT_PUBLIC_SITE_URL` in `next.config.ts`).
2. **Add DNS Records at Your Registrar:**
   - Copy the exact records shown in Vercel's Domains screen (typically `A @ -> 76.76.21.21` or project-assigned IP, `CNAME www -> cname.vercel-dns.com`, and `TXT _vercel` if requested).
   - In **Resend -> Domains -> Add Domain (`wafrah.sa`)**, copy Resend's `SPF` (`TXT`/`MX` on `send.wafrah.sa`) and `DKIM` (`TXT resend._domainkey`) records into your registrar DNS zone so `EMAIL_FROM` (`no-reply@wafrah.sa`) passes authentication.
3. **Wait for TLS:** Confirm both domains turn green (**Valid Configuration**) in Vercel (typically 5–30 min; up to 24h DNS propagation).
4. **Update Canonical Env Vars & Redeploy:** In Vercel **Settings -> Environment Variables** (**Production** scope), set both `APP_URL` and `NEXT_PUBLIC_SITE_URL` to `https://wafrah.sa`, then go to **Deployments -> `...` -> Redeploy** (required so Next.js bakes updated canonical tags, sitemap URLs, and redirects).
5. **Confirm HTTPS & Redirects:**

```bash
curl -sIL https://www.wafrah.sa | grep -iE '^(HTTP/|location:)'   # Expect 308 -> https://wafrah.sa/ -> 200
curl -sI http://wafrah.sa | head -n 5                              # Expect HTTPS upgrade redirect
```

---

## 5. Verify Cron Jobs

`vercel.json` schedules three UTC cron endpoints ([Vercel Cron Jobs](https://vercel.com/docs/schedules/cron-jobs)), each accepting `GET` (Vercel) and `POST`, protected by timing-safe `Authorization: Bearer <CRON_SECRET>`, `maxDuration = 300`, and an 80% runtime budget guard that resumes skipped tenants first on the next run:

- `/api/cron/daily` — `0 0 * * *` (`03:00 Asia/Riyadh`): anomaly alerts, deadline reminders, rate-limit table cleanup (`RateLimitBucket`), admin digest.
- `/api/cron/weekly` — `0 5 * * 0` (`08:00 Asia/Riyadh` Sun): weekly manager digest.
- `/api/cron/monthly` — `0 5 1 * *` (`08:00 Asia/Riyadh` 1st): monthly savings summary.

1. **Inspect in Vercel:** Project **Settings -> Cron Jobs** (verify 3 active jobs) and **Logs** filtered by `/api/cron/`.
2. **Verify Auth & Trigger Daily Cron Manually:**

```bash
curl -i https://wafrah.sa/api/cron/daily                            # Expect HTTP 401
curl -sS -H "Authorization: Bearer REPLACE_WITH_CRON_SECRET" \
  https://wafrah.sa/api/cron/daily                                 # Expect HTTP 200 and "ok":true
```

Now re-check `https://wafrah.sa/api/health/deep` (with Bearer token) and confirm HTTP `200` `"status":"ok"`.

3. **Read Structured Logs:** Open Vercel -> **Logs**, filter by `/api/cron/daily`, and verify the JSON line contains `"msg":"cron.daily.completed"`, `"requestId"`, `"tenantsFailed":0`, `"tenantsSkipped":0`, and `"rateLimitBucketsCleaned"`.

---

## 6. Monitoring, Error Tracking & Daily Pilot Routine

- **Runtime Logs:** Vercel **Logs** receives single-line JSON redacted by `src/lib/logger.ts` (secrets, Bearer tokens, DB passwords, phones, and PINs are masked).
- **Free Uptime Monitor:** Set up UptimeRobot or Better Stack Free (5–10 min checks):
  - **Public Liveness:** `GET https://wafrah.sa/api/health` -> alert if status != `200` (check `"status":"ok"`).
  - **Authenticated Readiness:** `GET https://wafrah.sa/api/health/deep` with header `Authorization: Bearer <CRON_SECRET>` -> alert on HTTP `503` (DB unreachable or daily cron missing/stale > 26h).
- **Optional Error Tracking (Recommended, Not Installed):** Sentry Developer Free tier (`@sentry/nextjs`) is **not** installed (`AGENTS.md` requires explicit user approval before adding packages). If approved later, strip cookies, `authorization` headers, phones, and staff names in `beforeSend` before sending telemetry outside KSA.
- **Daily Pilot Check (5 minutes every morning):**
  1. Confirm uptime monitors green and `/api/health/deep` reports `200 ok`.
  2. Filter Vercel Logs by `level:error` and `cron.daily.completed` (`tenantsFailed: 0`).
  3. Check Resend **Logs** for 0 bounces/complaints and review `/admin` for active kitchen shift submissions.

---

## 7. Instant Rollback

- **Vercel Dashboard:** Project **Deployments** (or Overview) -> click **`...`** on the last healthy Production deployment -> **Instant Rollback** -> confirm. Production traffic switches within seconds without rebuilding ([Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)).
- **Vercel CLI:** `vercel rollback <previous-deployment-url-or-id>` (check with `vercel rollback status`).
- **Database Interaction:** Instant Rollback reverts code **only** — environment variables and the PostgreSQL schema stay unchanged. Because all Wafrah migrations follow **Expand, Deploy, Contract** ([docs/DB-OPS.md](docs/DB-OPS.md)), Release N-1 runs cleanly against Release N's expanded schema. If data corruption or schema mismatch occurs, roll back the app immediately and push a forward-fix migration (`pnpm db:migrate:deploy`) — **never** run `prisma migrate reset` on Production.

---

## 8. Backups & Pre-Pilot Restore Test

- **Automated Provider Backups:** Confirm 7-day **Point-in-Time Recovery (PITR)** and daily automated snapshots are enabled on your Production database (included on Neon Launch; Supabase Pro includes daily snapshots with PITR as a paid add-on — never launch pilots on free tiers without automated backups).
- **Pre-Migration Snapshot:** Always take a manual logical dump against unpooled `DIRECT_URL` before running any production migration:

```bash
pg_dump "$DIRECT_URL" --format=custom --no-owner --no-privileges \
  --file="wafrah-pre-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

- **Mandatory Pre-Pilot Restore Drill:** **Before onboarding your first real restaurant**, execute the scratch-database `pg_restore` drill in [docs/DB-OPS.md](docs/DB-OPS.md) (provision temporary scratch DB -> `pg_restore` -> verify `_prisma_migrations` + table counts + smoke login -> delete scratch DB) to prove recovery works end-to-end.

---

## 9. Production Smoke-Test Checklist (AR & EN)

Run every check on `https://wafrah.sa` before inviting pilot restaurants:

- [ ] **Landing Pages (`/` & `/en`):** `/` renders RTL Arabic, `/en` renders LTR English, switcher (`English` / `العربية`) preserves section state, savings calculator shows zero console/hydration errors.
- [ ] **SEO & `noindex` Separation:** `curl -sI https://wafrah.sa` and `/en` contain **no** `X-Robots-Tag: noindex`; `/robots.txt` allows `/` and `/en` (while any Preview `*.vercel.app` URL returns `Disallow: /` + `X-Robots-Tag: noindex, nofollow`); `/sitemap.xml` returns valid XML; `/login`, `/dashboard`, `/log`, `/admin`, and `/api/health` all return `X-Robots-Tag: noindex, nofollow`.
- [ ] **Lead Capture -> `/admin`:** Submit `#pilot-form` on `/` (and/or `/en`); confirm lead record appears in `/admin` and founder notification reaches `FOUNDER_EMAIL`.
- [ ] **Admin -> Restaurant Onboarding:** Sign in at `/login` using `PLATFORM_ADMIN` credentials, create a test restaurant + manager, verify onboarding email/credentials.
- [ ] **Manager Dashboard (`/dashboard`):** Sign in as test manager; verify KPI cards, charts, menu setup (`/menu`), and CSV import page (`/imports`) work in both AR and EN.
- [ ] **Mobile Staff PIN & Offline Log (`/log`):** On a real phone (iOS/Android), open `/login` -> **Kitchen** tab, sign in with restaurant code + 4-digit PIN, log a waste entry online, switch on **Airplane Mode**, log another entry (verify queued badge), reconnect network, and confirm sync completes to `/dashboard`.
- [ ] **Cron -> Spike Alert:** Trigger `/api/cron/daily` with `Authorization: Bearer <CRON_SECRET>`; confirm spike/overdue alert appears in UI and email.
- [ ] **Arabic Monthly Print Report (`/reports/YYYY-MM`):** Open a monthly report in Arabic, run browser **Print / Save PDF**, and verify RTL tables/charts do not clip.
- [ ] **Email Deliverability:** Verify onboarding and alert emails arrive in inbox (not spam) from verified `EMAIL_FROM` with passing SPF/DKIM.

---

## 10. Legal & Compliance Gate (Required Before Real Data)

> [!CAUTION]
> **HARD STOP BEFORE PILOT CUSTOMER DATA:** Do not enter any real restaurant, manager, staff phone/name, or customer lead PII into Production until every item below is checked off.

- [ ] **Legal opinion on Saudi PDPL cross-border transfer and hosting region obtained** (covering `fra1` Vercel compute + `eu-central-1` PostgreSQL + Resend email processing; migrate database/compute region to `me-central2` if legal counsel requires in-Kingdom storage).
- [ ] Have Saudi legal counsel review and approve the draft Privacy Policy and Terms of Service (text in the `privacy` and `terms` sections of [messages/en.json](messages/en.json) and [messages/ar.json](messages/ar.json), rendered by [src/features/legal/legal-document.tsx](src/features/legal/legal-document.tsx)); the draft was written from [DATA.md](DATA.md) and is not a legal opinion (see [SECURITY.md](SECURITY.md)).
- [ ] Replace any placeholder citations/URLs in [src/config/sources.ts](src/config/sources.ts) with audited references (see [docs/LANDING-QA.md](docs/LANDING-QA.md)).

---

## 11. Estimated Pilot Cost (Verified 2026-11-15)

| Service | Plan / Scope | Estimated Cost | Notes & Official Pricing |
| --- | --- | --- | --- |
| **Vercel** | **Pro** (1 operator seat) | **`$20/mo`** (`$240/yr`) | Includes `$20` usage credit; required for commercial apps ([vercel.com/pricing](https://vercel.com/pricing)) |
| **PostgreSQL (Primary)** | **Neon Launch** (`eu-central-1`) | **`~$5–$20/mo`** (`~$60–$240/yr`) | Usage-based: `$0` base, `$0.106/CU-hr`, `$0.35/GB-mo` storage, `$0.20/GB-mo` 7d PITR, 500 GB egress ([neon.com/pricing](https://neon.com/pricing)) |
| **PostgreSQL (Alternative)** | **Supabase Pro** (`eu-central-1`) | **`$25/mo`** (`~$125/mo` w/ PITR) | Includes `$10` Micro compute + `8 GB` DB + 7d daily backups; PITR add-on `~$100/mo` ([supabase.com/pricing](https://supabase.com/pricing)) |
| **Email (Resend)** | **Free** -> **Pro** | **`$0/mo`** -> **`$20/mo`** | Free: `3,000/mo` (`100/day` cap); Pro: `50,000/mo`, no daily cap ([resend.com/pricing](https://resend.com/pricing)) |
| **`.sa` Domain** | SaudiNIC registrar | **`~90–100 SAR/yr`** (`~$24–$27/yr`) | Via SaudiNIC-accredited local registrar ([nic.sa](https://nic.sa/)) |
| **Pilot Total** | Neon Launch + Resend Free | **`~$27–$42/mo`** (`~$325–$500/yr`) | Add `+$20/mo` once email volume exceeds `100/day` |

---

## Manual Steps That Only You Can Perform

1. **Register & Verify Accounts:** Register `wafrah.sa` via a SaudiNIC registrar, and sign up for GitHub, Vercel Pro, Neon Launch (or Supabase Pro), and Resend.
2. **Complete Legal Sign-Off (Section 10):** Obtain the Saudi PDPL cross-border legal opinion, approve legal copy for `/privacy` and `/terms`, and verify [src/config/sources.ts](src/config/sources.ts).
3. **Configure GitHub Branch Protection & Cloud Env Vars:** Protect `main` in GitHub, connect the repo in Vercel Pro (`fra1`, Node `22.x`), and populate Production & Preview env vars per [docs/ENV.md](docs/ENV.md) and [docs/STAGING.md](docs/STAGING.md).
4. **Provision DNS & TLS:** Add Vercel `A`/`CNAME`/`TXT` and Resend `SPF`/`DKIM` records at your `.sa` registrar, then lock canonical `https://wafrah.sa` URLs and redeploy.
5. **Run Initial Migration, Admin Seed & Restore Drill:** Execute `pnpm db:migrate:deploy` and `pnpm db:seed:prod` from your machine with `DIRECT_URL`, verify `/api/cron/daily` + `/api/health/deep`, and complete one scratch DB `pg_restore` drill before onboarding pilots.
6. **Set Monitoring & Complete Smoke Checklist:** Add UptimeRobot/Better Stack checks on `/api/health` and `/api/health/deep`, then sign off every AR/EN checkbox in Section 9 (including real mobile offline PIN logging and test print reports).
