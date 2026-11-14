# Wafrah Pilot Deployment Guide

Step-by-step instructions to deploy **Wafrah** to **Vercel** with a managed **PostgreSQL** database for a controlled pilot.

> [!CAUTION]
> **Do not deploy to production with demo data.** Never run `pnpm db:seed` against staging customer data or production. Production databases must only be bootstrapped with a single Platform Admin account using `pnpm db:seed:prod`.

---

## 1. Saudi PDPL & Data Residency Warning (Read First)

Wafrah stores operational restaurant data (menu items, waste entries, POS sales, purchases, forecasts, and alert logs) alongside **personal data** defined in [`DATA.md`](./DATA.md):

- Staff names and usernames (`User.name`, `User.username`)
- Manager/owner/platform-admin names and email addresses (`User.email`)
- Audit trail actor records (`AuditLog.userId`)
- Transactional email recipient logs sent through Resend

Under Saudi Arabia's **Personal Data Protection Law (PDPL)** and its Cross-Border Data Transfer Regulations, transferring personal data outside the Kingdom of Saudi Arabia is restricted unless strict legal conditions are met (such as adequacy, Standard Contractual Clauses / binding rules, or statutory exceptions).

> [!IMPORTANT]
> **Legal Review Required:** Before onboarding real customer restaurants or uploading real employee names/emails, obtain a qualified Saudi legal opinion covering your hosting topology (database, Vercel serverless functions, transactional email via Resend, and backups). **This guide does not constitute legal advice and does not establish PDPL compliance.**

### Region Risk Summary (Lowest Transfer Risk First)

1. **Lowest DB residency risk (In-Kingdom):** **Google Cloud SQL for PostgreSQL in `me-central2` (Dammam, KSA)**. Database storage and automated backups stay physically inside Saudi Arabia. *(Note: Vercel Serverless Functions and Resend email servers still execute outside Saudi Arabia unless self-hosted/Enterprise in-Kingdom compute and local SMTP gateways are used.)*
2. **GCC regional latency (Cross-border — outside KSA):** **AWS RDS PostgreSQL in `me-south-1` (Bahrain) or `me-central-1` (UAE)** paired with Vercel compute in **`dxb1` (Dubai)**. Lower latency to Riyadh/Jeddah (~15–40 ms), **but legally still cross-border outside Saudi Arabia**.
3. **EU managed serverless (Cross-border — requires PDPL legal basis):** **Neon** or **Supabase** in **Frankfurt (`eu-central-1`)** paired with Vercel **`fra1` (Frankfurt)** or **`dxb1` (Dubai)**. Easiest to operate for an internal technical pilot, **requires legal sign-off before hosting real customer/staff personal data**.

---

## 2. Managed PostgreSQL Comparison & Pilot Recommendation

| Option | Region Options | Pilot Pricing Tier | Serverless Connection Pooling | Automated Backups & PITR |
| :--- | :--- | :--- | :--- | :--- |
| **Neon Serverless Postgres** | AWS US, **EU Frankfurt (`aws-eu-central-1`)**, APAC. *No KSA/GCC region.* | **Launch** usage-based (~$5–$20/mo light pilot; Free pauses after 5 min idle and is not suitable for pilot). | **Built-in PgBouncer** (`-pooler` hostname for `DATABASE_URL`) + separate direct hostname for `DIRECT_URL`. | **Included on paid plans** (Launch: 7-day point-in-time recovery + scheduled snapshots). |
| **Supabase Postgres** | AWS EU (**Frankfurt `eu-central-1`**), Mumbai, US, APAC. *No KSA/GCC region.* | **Pro ($25/mo)** (stays always-on; Free tier pauses after 7 days inactivity with **no backups**). | **Built-in Supavisor** (Transaction pooler port `6543` for `DATABASE_URL`; Direct/Session port `5432` for `DIRECT_URL`). | **Automated daily backups** on Pro (7-day retention); PITR is a paid add-on. |
| **Google Cloud SQL (`me-central2`)** | **Dammam, Saudi Arabia (`me-central2`)**. | **High cost for pilot** (small shared-core or dedicated vCPU + Cloud SQL Proxy/NAT or VPC Peering). | **External setup required** (Cloud SQL Auth Proxy + PgBouncer or Cloud VPC/PSC peering for Vercel). | **Built-in** automated daily backups (7–365 days) + 7-day PITR inside KSA. |
| **AWS RDS PostgreSQL (`me-central-1` / `me-south-1`)** | **UAE (`me-central-1`)** or **Bahrain (`me-south-1`)**. | Moderate (~$15–$50/mo small instance + RDS Proxy ~$15/mo+). | **Requires RDS Proxy** (~$15+/mo) to avoid exhausting Postgres connections from Vercel functions. | **Built-in** automated daily snapshots (up to 35 days) + PITR. |

### Pilot Recommendation & Tradeoffs

- **For real Saudi customer pilots (prioritizing PDPL residency):** Choose **Google Cloud SQL in `me-central2` (Dammam)** once you have VPC/PgBouncer connectivity configured, **and** have Saudi legal counsel review the full data flow (Vercel compute + Resend email).
- **For an internal/synthetic pilot (or once legal counsel approves EU transfer mechanisms):** Choose **Neon (Launch plan, `aws-eu-central-1` Frankfurt)** as the primary serverless recommendation:
  - **Why Neon fits Wafrah best technically:** Zero-config PgBouncer pooling (`-pooler` URL), separate `DIRECT_URL` for `prisma migrate deploy`, instant database branching for Staging/Preview environments, built-in PITR/snapshots, and low pilot cost without 5-minute cold-pause surprises once on the paid Launch plan.
  - **Runner-up:** **Supabase Pro (`$25/mo`, `eu-central-1` Frankfurt)** if you prefer predictable flat monthly billing with guaranteed always-on compute and daily backups out of the box.
- **Vercel Plan Note:** Vercel **Hobby** is restricted to non-commercial use and does not let you pin function compute near the Middle East or guarantee exact-minute cron timing. Use **Vercel Pro** for any live pilot and set Function Region to **`fra1` (Frankfurt)** (if DB is in Frankfurt) or **`dxb1` (Dubai)** (if DB is in Dammam/Bahrain/UAE).

---

## 3. Environment Variable Checklist

Generate secrets locally in your terminal before configuring Vercel:

```bash
# AUTH_SECRET (32+ random bytes, base64)
openssl rand -base64 32

# CRON_SECRET (32 random bytes, hex)
openssl rand -hex 32
```

| Variable | Production Scope | Preview / Staging Scope | Notes |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Required** (Pooled URI) | **Required** (Staging Pooled URI) | Runtime Postgres connection via PgBouncer / Supavisor (e.g., `?sslmode=require` + `?pgbouncer=true` for Supabase `:6543`). |
| `DIRECT_URL` | **Recommended** (Direct URI) | **Recommended** (Staging Direct URI) | Unpooled Postgres URL used automatically by [`scripts/vercel-build.mjs`](./scripts/vercel-build.mjs) when running `prisma migrate deploy`. |
| `AUTH_SECRET` | **Required** (unique secret) | **Required** (different secret) | Signs Auth.js JWT session cookies. Changing it signs out all active sessions. |
| `APP_URL` | **Required** (`https://app.yourdomain.sa`) | Optional (Staging URL or omit) | Sets canonical origin in email links, secure cookie policy (`shouldUseSecureCookies`), CSP `upgrade-insecure-requests`, and HSTS (`next.config.ts`). **Never set Production domain here for Preview.** |
| `AUTH_TRUST_HOST` | Omit (`false` unless behind extra proxy) | **Set `"true"`** | Needed only on Staging/Preview ephemeral `.vercel.app` hostnames so Auth.js accepts preview URLs without setting `AUTH_URL`. **Never set `AUTH_URL` on Preview.** |
| `RESEND_API_KEY` | **Required** (`re_...`) | Optional (`re_test_...`) | Production fails closed and logs an error if missing or placeholder (`src/lib/email.ts`). |
| `EMAIL_FROM` | **Required** (`Wafrah <notifications@yourdomain.sa>`) | Optional | Sender domain **must** be DNS-verified (SPF + DKIM) in Resend. |
| `CRON_SECRET` | **Required** (unique secret) | **Required** (different secret) | Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when invoking `vercel.json` schedules. |
| `SKIP_MIGRATE_DEPLOY` | Leave unset (`0`) | Optional (`1` on read-only previews) | Set to `"1"` only when a preview deploy must skip build-time `prisma migrate deploy`. |
| `SEED_ADMIN_EMAIL` | **CLI only — do not save in Vercel** | CLI only | Used once when running `pnpm db:seed:prod`. |
| `SEED_ADMIN_PASSWORD` | **CLI only — do not save in Vercel** | CLI only | >= 12 chars (upper + lower + digit/symbol). Rejects demo/placeholder strings. |
| `SEED_ADMIN_NAME` | Optional CLI only | Optional CLI only | Defaults to `"Wafrah Platform Admin"`. |
| `SEED_ADMIN_USERNAME` | Optional CLI only | Optional CLI only | Defaults to `"platform-admin"`. |
| `SEED_ADMIN_LOCALE` | Optional CLI only | Optional CLI only | `"ar"` (default) or `"en"`. |

---

## 4. Production Migration Strategy & Safe Admin Seeding

### Build & Migration Pipeline

[`vercel.json`](./vercel.json) configures Vercel to run `"buildCommand": "pnpm run vercel-build"`, which executes [`scripts/vercel-build.mjs`](./scripts/vercel-build.mjs):

1. `pnpm exec prisma generate` — generates the typed Prisma Client matching `prisma/schema.prisma`.
2. `pnpm exec prisma migrate deploy` — applies pending migrations from `prisma/migrations/` using `DIRECT_URL` (falling back to `DATABASE_URL` if `DIRECT_URL` is omitted). Because migrations run **before** `next build --webpack`, schema mismatches stop a broken release before traffic switches.
3. `pnpm exec next build --webpack` — compiles the Next.js production bundle.

> [!WARNING]
> **Migration Hygiene Rules:**
> - Never use `prisma db push` against staging or production. Always create forward-only SQL migrations locally (`pnpm db:migrate`).
> - Make additive migrations backwards-compatible whenever possible so the running deployment stays healthy during the brief window between `migrate deploy` and Vercel traffic cutover.

### Production Seed Rule (Zero Demo Data)

1. **Demo data guard:** [`prisma/seed.ts`](./prisma/seed.ts) explicitly throws when `NODE_ENV=production`. Demo restaurants (`SHAMI-JED`, `DIWAN-MKH`) and their sample staff/passwords must **never** be seeded into production.
2. **Production admin bootstrap:** [`prisma/seed-prod.ts`](./prisma/seed-prod.ts) (`pnpm db:seed:prod`) creates **only** one `PLATFORM_ADMIN` user (`tenantId: null`, `pinHash: null`) and records a `PLATFORM_ADMIN_BOOTSTRAPPED` row in `AuditLog`. Running it a second time safely skips creation without modifying existing users.

---

## 5. Step-by-Step Deployment Instructions

### Step 1: Provision PostgreSQL

1. Create a production database project in your chosen provider (e.g., Neon Launch in `aws-eu-central-1` Frankfurt, or Supabase Pro, or GCP Cloud SQL `me-central2`).
2. Copy **two** connection strings:
   - **Pooled URL** -> save as `DATABASE_URL` (on Neon: ends with `-pooler...&sslmode=require`; on Supabase: port `6543` with `?pgbouncer=true&connection_limit=1`).
   - **Direct / Session URL** -> save as `DIRECT_URL` (on Neon: unpooled hostname without `-pooler`; on Supabase: port `5432`).
3. Verify SSL enforcement (`sslmode=require`) is enabled on both URLs.

### Step 2: Configure Resend Email

1. In the Resend dashboard, add your sending domain (e.g., `notifications.yourdomain.sa`).
2. Add the SPF (`TXT`) and DKIM (`TXT`/`CNAME`) DNS records at your domain registrar and wait for `Verified` status.
3. Create an API key scoped to sending email only and save it for `RESEND_API_KEY`.

### Step 3: Set Up the Vercel Project

1. Push the repository to a private GitHub/GitLab repository.
2. In Vercel, click **Add New -> Project** and import the repository.
3. Confirm Vercel detects `Framework Preset: Next.js` and `pnpm` (`package.json` includes `postinstall: "prisma generate"` and `vercel.json` sets `buildCommand: "pnpm run vercel-build"`).
4. In **Project Settings -> Environment Variables**, add all **Production** variables from Section 3 (making sure to select **Production** only for `APP_URL`, production `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`).
5. In **Project Settings -> Functions**, select your compute region (`fra1` Frankfurt or `dxb1` Dubai on Vercel Pro) matching your chosen PostgreSQL region.
6. Trigger the first deployment (`main` branch). Watch the build logs to confirm:
   - `prisma migrate deploy` applied all migrations cleanly.
   - `next build --webpack` succeeded.

### Step 4: Connect Your Custom Domain

1. In Vercel **Project Settings -> Domains**, add your production domain (e.g., `app.yourdomain.sa`).
2. Update your DNS provider with the exact `CNAME` / `A` record shown by Vercel and wait for TLS certificate issuance (`Valid Configuration`).
3. Confirm `APP_URL` in Vercel **Production** environment variables matches `https://app.yourdomain.sa` (no trailing slash), and `EMAIL_FROM` uses your verified domain. Redeploy once if you updated `APP_URL`.

### Step 5: Create the Initial Platform Admin

Run the safe production bootstrap **once** from a secure operator terminal (without storing `SEED_ADMIN_PASSWORD` in Vercel):

```bash
# Export temporary bootstrap credentials in your local shell ONLY (prefix space if zsh HIST_IGNORE_SPACE is enabled)
export NODE_ENV=production
export DATABASE_URL="postgresql://YOUR_DIRECT_OR_POOLED_PROD_URL?sslmode=require"
export SEED_ADMIN_EMAIL="ops-admin@yourdomain.sa"
export SEED_ADMIN_PASSWORD="ReplaceWithStrong!16CharPassword"
export SEED_ADMIN_NAME="Wafrah Operations Admin"
export SEED_ADMIN_LOCALE="ar"

pnpm db:seed:prod

# Immediately clear sensitive values from your current shell
unset SEED_ADMIN_PASSWORD DATABASE_URL
```

Expected JSON output:

```json
{"event":"SEED_PROD_COMPLETED","status":"created","userId":"...","email":"ops-admin@yourdomain.sa","username":"platform-admin"}
```

Re-running the command returns `"status":"skipped","reason":"platform_admin_exists"`.

### Step 6: Verify Vercel Cron Jobs

[`vercel.json`](./vercel.json) registers the three scheduled jobs in UTC (`Asia/Riyadh` = UTC+3):

| Endpoint | Schedule (UTC) | Equivalent `Asia/Riyadh` | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/cron/daily` | `0 0 * * *` | `03:00` daily | Insights anomaly scan -> Forecast + Newsvendor -> Critical alert emails |
| `/api/cron/weekly` | `15 0 * * 0` | `03:15` every Sunday | Weekly waste & prep summary emails |
| `/api/cron/monthly` | `30 0 1 * *` | `03:30` 1st of month | Monthly SAR savings & waste report emails |

Vercel automatically invokes these paths via HTTP **`GET`** with header `Authorization: Bearer <CRON_SECRET>`. Check Vercel **Project Settings -> Cron Jobs** after deployment to confirm all 3 entries appear as Active.

Verify secret rejection from any terminal:

```bash
# 1. Must return HTTP 401 Unauthorized (never 200)
curl -i "https://app.yourdomain.sa/api/cron/daily"

# 2. Must return HTTP 401 Unauthorized with wrong token
curl -i -H "Authorization: Bearer invalid-token" "https://app.yourdomain.sa/api/cron/daily"

# 3. Optional authorized dry test (runs daily job on production tenants)
curl -i -H "Authorization: Bearer YOUR_CRON_SECRET" "https://app.yourdomain.sa/api/cron/daily"
```

---

## 6. Health Check & Monitoring Recommendations

### Built-in Health Endpoint

`/api/health` is publicly accessible (no session cookie required) and runs `SELECT 1` against PostgreSQL:

- **Healthy (`200 OK`):** `{"status":"ok","db":"up","version":"0.1.0","commitSha":"...","region":"...","latencyMs":12,"timestamp":"..."}`
- **Database unreachable (`503 Service Unavailable`):** `{"status":"degraded","db":"down",...}` with connection strings and stack traces omitted.

### Suggested External Monitoring (Optional — Requires Approval Before Adding Packages)

- **Uptime & Cron Alerting (No code changes needed):** Point Better Stack or UptimeRobot at `https://app.yourdomain.sa/api/health` every 1–5 minutes, alerting on non-`200` status or `"db":"down"`. Also configure Vercel Log Drains / notification webhooks for failed builds or `5xx` functions.
- **Error Tracking (Suggested — NOT installed):** **Sentry Free Tier (Developer, 5k errors/mo)** captures Next.js server/client exceptions and Vercel cron failures. Per project policy (`AGENTS.md`), no telemetry package (`@sentry/nextjs`) is installed unless you explicitly approve adding the dependency and configuring `SENTRY_DSN` in CSP `connect-src`.
- **PDPL Note for Error Monitoring:** If you enable Sentry later, configure `beforeSend` scrubbing and `sendDefaultPii: false` so staff names, usernames, emails, and restaurant financial rows are stripped before leaving Vercel.

---

## 7. Automated Daily Backups & Restore Test Runbook

### Provider Backup Configuration

- **Neon (Launch/Scale):** Enable scheduled daily snapshots (or rely on continuous 7-day PITR history on Launch / 30-day on Scale) in the **Backups & Restore** tab.
- **Supabase (Pro):** Daily backups are enabled automatically (7-day retention). Downloadable backup archives and PITR require Pro / PITR add-on.
- **GCP Cloud SQL / AWS RDS:** Enable automated daily backups (at least 7–14 days retention) with point-in-time recovery (transaction logs) inside the same region (`me-central2` for KSA residency).

### Monthly Restore Test Procedure (Never Overwrite Production)

Run this verification before pilot launch and once per month thereafter:

1. **Restore into an isolated target database or branch:**
   - **Neon:** Click **Restore** or **Create Branch -> Time/LSN** from yesterday's backup timestamp into a temporary branch named `restore-drill-YYYY-MM-DD`.
   - **Supabase / Cloud SQL / RDS:** Restore the latest daily snapshot into a **separate** temporary database instance (never into the live production primary).
2. **Inspect schema & migration state from your terminal:**
   ```bash
   export RESTORE_TEST_URL="postgresql://...restore-drill-host...?sslmode=require"
   DATABASE_URL="$RESTORE_TEST_URL" pnpm exec prisma migrate status
   ```
   Confirm Prisma reports `Database schema is up to date!`.
3. **Verify critical record integrity (read-only query):**
   ```bash
   psql "$RESTORE_TEST_URL" -c "SELECT count(*) AS restaurants FROM \"Restaurant\";"
   psql "$RESTORE_TEST_URL" -c "SELECT count(*) AS users FROM \"User\";"
   psql "$RESTORE_TEST_URL" -c "SELECT count(*) AS waste_entries FROM \"WasteEntry\";"
   psql "$RESTORE_TEST_URL" -c "SELECT max(\"createdAt\") AS latest_waste_at FROM \"WasteEntry\";"
   ```
4. **Verify app compatibility (optional):** Temporarily point the Staging Preview env at `RESTORE_TEST_URL`, open `/api/health`, and confirm `{"status":"ok","db":"up"}` + login with a test account.
5. **Clean up & log the drill:** Delete the temporary `restore-drill-*` branch/instance immediately and log the date, backup timestamp, RTO duration, and verified row counts in your ops log.

---

## 8. Staging Environment Setup

Maintain a completely isolated **Staging** environment for QA, schema migration rehearsals, and product demos:

1. Create a **separate PostgreSQL database** (or a persistent Neon `staging` branch completely separate from `production`).
2. Create a long-lived `staging` Git branch (or configure Vercel **Preview** scope env vars):
   - `DATABASE_URL` & `DIRECT_URL` -> Staging DB only (never Production!)
   - `AUTH_SECRET` & `CRON_SECRET` -> Staging-only random secrets
   - `AUTH_TRUST_HOST="true"` -> **Required** so Vercel preview/branch URLs authenticate cleanly
   - **Do NOT set `AUTH_URL`** on Preview scope, and do **not** point `APP_URL` to your production domain on Preview.
3. Demo/sample data (`pnpm db:seed`) is allowed **only** on local development and internal engineering staging databases that contain zero real customer PII. Production must **never** receive demo tenants or test credentials.

---

## 9. Post-Deploy Smoke-Test Checklist

Complete every item after deploying and seeding the Platform Admin:

- [ ] **Health check:** `curl -s https://app.yourdomain.sa/api/health` returns HTTP `200` with `"status":"ok"` and `"db":"up"`.
- [ ] **Security headers:** `curl -I https://app.yourdomain.sa/login` confirms `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy`.
- [ ] **Cron protection:** `curl -i https://app.yourdomain.sa/api/cron/daily` without `Authorization` header returns HTTP `401`.
- [ ] **No demo data leaked:** Log in at `/login` using the `PLATFORM_ADMIN` email created via `pnpm db:seed:prod`; confirm `/admin` shows **0 restaurants** (no `SHAMI-JED` or `DIWAN-MKH`).
- [ ] **Tenant provisioning:** Create your first pilot restaurant in `/admin`, confirm its status is `ACTIVE`, and verify the restaurant manager receives or can log in with initial credentials.
- [ ] **Staff mobile logging (RTL Arabic):** Sign in via `/log` with a restaurant code + staff PIN on a mobile browser, log a waste entry, undo once, then toggle Airplane Mode -> log offline -> reconnect and verify automatic sync succeeds.
- [ ] **Manager workflow:** Sign in as Manager, add a menu item, import a sample POS CSV file, check `/dashboard` KPIs + Recharts views load cleanly, and export tenant data ZIP (`/settings/notifications`) + monthly report (`/reports`).
- [ ] **Transactional email:** Trigger a test alert/report or password check and confirm delivery from your verified `EMAIL_FROM` address without landing in spam.
- [ ] **Backup & alert check:** Confirm daily backup schedule is active on your Postgres provider and Uptime monitor alerts on `/api/health`.
