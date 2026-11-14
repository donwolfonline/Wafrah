# Wafrah Database Operations Runbook (`docs/DB-OPS.md`)

Operational guide for **PostgreSQL + Prisma ORM (`6.19.3`)** running behind **Vercel Serverless Functions**.

> [!IMPORTANT]
> **Saudi PDPL Cross-Border Data Transfer Notice (Read First):**
> Wafrah stores operational restaurant metrics alongside personal data (`User.name`, `User.email`, `User.username`, `Lead.name`, `Lead.businessName`, `Lead.phone`, `Lead.email`, `Feedback`, `AuditLog`). Under Saudi Arabia's **Personal Data Protection Law (PDPL)** and its Cross-Border Data Transfer Regulations, moving personal data outside Saudi Arabia (for example to Frankfurt, Mumbai, UAE, or Bahrain servers, Vercel function regions, or US/EU email providers) is subject to strict legal rules.
>
> **Do NOT interpret any infrastructure setup in this document as PDPL compliance.** Before storing real customer, manager, staff, or lead personal data in production, obtain a qualified legal opinion covering your exact hosting region, Vercel compute region, transactional email provider (Resend), and backup/snapshot locations.

---

## 1. Prisma Datasource & Connection Safety

### 1.1 Dual Connection Strings (`DATABASE_URL` vs `DIRECT_URL`)

Per the official Prisma ORM v6 documentation ([Prisma Schema Reference — `datasource`](https://www.prisma.io/docs/orm/reference/prisma-schema-reference#datasource) and [Configure Prisma Client with PgBouncer](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer)), [`prisma/schema.prisma`](file:///Users/frederickdineen/wafrah/prisma/schema.prisma) configures both URLs:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL") // Pooled runtime URL for serverless functions
  directUrl = env("DIRECT_URL")   // Direct unpooled URL for Prisma CLI migrations
}
```

> Note: This project uses Prisma `6.19.3` (`schema.prisma` `directUrl` is the documented configuration for Prisma ORM v6 and earlier; Prisma ORM v7 later moved datasource URLs into `prisma.config.ts`).

| Variable | Target Endpoint | Used By | Vercel Runtime Env? |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Pooled** connection (PgBouncer / Supavisor / Neon `-pooler`, e.g., port `6543` or `-pooler` host) | Next.js / Vercel Serverless runtime (`PrismaClient`) | **Yes** |
| `DIRECT_URL` | **Direct / unpooled** connection (port `5432`, bypassing transaction poolers) | `pnpm db:migrate:deploy`, `prisma validate`, `pg_dump`, `pnpm db:seed:prod` | **No** *(keep on operator machine / approved CI runner)* |

Keeping `DIRECT_URL` off Vercel serverless runtime functions reduces blast radius and is supported by [`src/env.schema.ts`](file:///Users/frederickdineen/wafrah/src/env.schema.ts) and [`src/env.core.ts`](file:///Users/frederickdineen/wafrah/src/env.core.ts), which validate `DIRECT_URL` inside `validateMigrationEnv()` without requiring it for web request execution.

### 1.2 Single Pooled Client Per Serverless Instance

Code audit verification across the repository:

1. **Single `new PrismaClient` factory:** Only [`createPlatformPrismaClient`](file:///Users/frederickdineen/wafrah/src/lib/db-factory.ts) instantiates `PrismaClient`.
2. **Global singleton cache:** [`src/lib/db.ts`](file:///Users/frederickdineen/wafrah/src/lib/db.ts) caches the client unconditionally on `globalThis.platformAdminDbV3` so warm serverless worker containers and multiple Next.js route bundles inside the same isolate reuse **one** pooled `PrismaClient` instance rather than opening new pools per request.
3. **No `$disconnect()` inside request handlers:** Per [Prisma Connection Management](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-management), API routes and Server Actions reuse the shared global client without calling `$disconnect()`. Only one-off CLI scripts (`scripts/run-daily.ts`, `prisma/seed.production.ts`) call `$disconnect()` on exit.
4. **Tenant isolation preserved:** All restaurant queries go through `createTenantDb` / `getTenantDb` in [`src/lib/tenant.ts`](file:///Users/frederickdineen/wafrah/src/lib/tenant.ts).

### 1.3 Recommended Serverless Pool Query Parameters

Configure `DATABASE_URL` with conservative per-instance settings so concurrent Vercel Lambda/Fluid Compute invocations cannot exhaust Postgres backend connections ([Connection Management](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-management) & [PgBouncer Guide](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer)):

```env
# Example: external transaction pooler (e.g., Supabase :6543 or PgBouncer < 1.21.0)
DATABASE_URL="postgresql://USER:PASSWORD@POOLER_HOST:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=1&pool_timeout=15&connect_timeout=10"

# Direct connection (port 5432) used ONLY from operator CLI / CI migration step
DIRECT_URL="postgresql://USER:PASSWORD@DIRECT_HOST:5432/postgres?sslmode=require&connect_timeout=10"
```

| Parameter | Recommended Value | Why |
| :--- | :--- | :--- |
| `connection_limit` | `1` (or `2` under Fluid Compute concurrency; verify with load test) | Limits Prisma's per-instance engine pool when scaling horizontally across many Vercel containers so the database-side pooler (`PgBouncer`/`Supavisor`) queues work cleanly. |
| `pool_timeout` | `15` (seconds) | Bounds wait time for a free slot inside the instance pool before failing cleanly instead of hanging to Vercel function timeout. |
| `connect_timeout` | `10` (seconds) | Bounds initial TLS/TCP handshake wait during cold starts or transient network blips. |
| `pgbouncer` | `true` for PgBouncer `< 1.21.0` (and Supabase `:6543`); check provider docs if using PgBouncer `>= 1.21.0` | Prisma docs state `?pgbouncer=true` disables prepared statement caching for PgBouncer `< 1.21.0` in transaction mode, while PgBouncer `>= 1.21.0` (with `max_prepared_statements > 0`) supports prepared statements without the flag. Neon `-pooler` endpoints run PgBouncer in transaction mode (`max_client_conn = 10000`). |
| `sslmode` | `require` (or `verify-full` where CA chain is configured) | Enforces encrypted TLS connections from Vercel to managed Postgres. |

---

## 2. Migration Strategy & Backward-Compatibility Rules

### 2.1 Zero Auto-Migrations in Vercel Builds

[`scripts/vercel-build.mjs`](file:///Users/frederickdineen/wafrah/scripts/vercel-build.mjs) runs **only**:

1. `pnpm exec prisma generate`
2. `pnpm exec next build --webpack`

**Preview builds and Production builds NEVER run `prisma migrate deploy`, `prisma migrate dev`, or `prisma db push`.** Preview branches must point at an isolated staging database (never production) and must never mutate shared schemas automatically during PR builds.

### 2.2 Deliberate Pre-Promotion Migration Runbook

Run migrations **deliberately from a trusted operator terminal or an approved CI gate** **before** promoting a production deployment (so the schema is ready before new Vercel instances serve traffic):

```bash
# 1. Confirm you are targeting the intended database (verify host!)
export NODE_ENV=production
export DATABASE_URL="postgresql://USER:PASSWORD@POOLER_HOST:6543/DB?sslmode=require&pgbouncer=true&connection_limit=1"
export DIRECT_URL="postgresql://USER:PASSWORD@DIRECT_HOST:5432/DB?sslmode=require"

# 2. Take a pre-migration backup (Section 4) and check pending migrations first
pnpm exec prisma migrate status

# 3. Inspect the SQL in prisma/migrations/<new_migration>/migration.sql before applying!
# 4. Apply forward-only migrations using DIRECT_URL
pnpm db:migrate:deploy

# 5. Re-check status (must report database schema is up to date)
pnpm exec prisma migrate status

# 6. Clear secrets from shell environment immediately
unset DATABASE_URL DIRECT_URL
```

Then promote the new Vercel Production deployment (or re-run **Instant Rollback** if smoke tests fail).

### 2.3 Backward-Compatibility Rule (Expand, Deploy, Contract)

**Rule:** Every migration applied before a production deployment MUST stay 100% compatible with the **currently running (previous)** version of the application, so:

1. Existing requests succeed during the window between `pnpm db:migrate:deploy` and Vercel deployment cutover.
2. **An Instant Rollback in Vercel never crashes on schema mismatches.**

Follow two-phase **Expand and Contract**:

| Phase | Safe Allowed DDL | Never Combine With |
| :--- | :--- | :--- |
| **Release N (Expand)** | `CREATE TABLE`, add **nullable** columns or columns with `DEFAULT`, add new `INDEX` (`CONCURRENTLY` for large hot tables via manual SQL if needed), add new enum values (if old code ignores unknown values or doesn't fail exhaustively). | Never `DROP COLUMN`, `DROP TABLE`, rename active columns/tables, tighten `NOT NULL` without a safe `DEFAULT`, or remove enum variants used by Release N-1. |
| **Release N+1 (Contract — later deployment)** | Once Release N is baked in and rollback to N-1 is no longer needed, backfill/validate constraints and remove obsolete columns/tables in a dedicated cleanup migration. | — |

---

## 3. Production Admin Seeding (`prisma/seed.production.ts`)

Demo seeding (`pnpm db:seed` -> [`prisma/seed.ts`](file:///Users/frederickdineen/wafrah/prisma/seed.ts)) inserts demo restaurants (`SHAMI-JED`, `DIWAN-MKH`) and test passwords, and **hard-refuses to run whenever `NODE_ENV=production` or `VERCEL_ENV=production`**.

For a fresh production database, [`prisma/seed.production.ts`](file:///Users/frederickdineen/wafrah/prisma/seed.production.ts) (`pnpm db:seed:prod`):

- Creates **only** the initial `PLATFORM_ADMIN` user (`tenantId: null`, `pinHash: null`) plus one `AuditLog` entry.
- Reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from runtime environment variables (**never hard-coded, never echoed in logs or errors**).
- **Refuses to run** (exits with status `1`) if any `PLATFORM_ADMIN` user already exists in the database.
- **Refuses to run** (exits with status `1`) if `DATABASE_URL` or `DIRECT_URL` points to `localhost` / `127.0.0.1` / `::1` / `0.0.0.0`, unless `--allow-local` is passed explicitly.

```bash
# Production bootstrap (one-time per fresh database)
export NODE_ENV=production
export DATABASE_URL="postgresql://..."
export DIRECT_URL="postgresql://..."
export ADMIN_EMAIL="ops-admin@yourdomain.sa"
export ADMIN_PASSWORD="GenerateStrong!UniquePassword16+"
export ADMIN_NAME="Wafrah Platform Admin"
export ADMIN_LOCALE="ar"

pnpm db:seed:prod
unset ADMIN_EMAIL ADMIN_PASSWORD DATABASE_URL DIRECT_URL

# Intentional local test against localhost requires --allow-local:
pnpm db:seed:prod -- --allow-local
```

---

## 4. Backups, Manual `pg_dump`, Restore Testing & Migration Rollback

### 4.1 Managed Backup Expectations

For a live pilot holding customer or pilot operational data:

- **Do NOT use Free tiers** without automated backups (e.g., Supabase Free has no automated backups; Neon Free limits PITR history to 6 hours and suspends computes after 5 minutes).
- Require **daily automated snapshots + continuous Write-Ahead Log (WAL) Point-in-Time Recovery (PITR)** retained for at least **7 days** (ideally 14–30 days as volume grows).
- Before any schema migration or bulk operational cleanup, verify a recent PITR timestamp or take a manual `pg_dump` snapshot.

### 4.2 Manual Backup (`pg_dump`) Command

Always run `pg_dump` against **`DIRECT_URL`** (port `5432`, unpooled — **never** through PgBouncer/Supavisor transaction mode `:6543`):

```bash
# Set DIRECT_URL in shell, output binary compressed dump OUTSIDE the git repo
export DIRECT_URL="postgresql://USER:PASSWORD@DIRECT_HOST:5432/postgres?sslmode=require"
mkdir -p "$HOME/wafrah-backups"
pg_dump "$DIRECT_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --verbose \
  --file="$HOME/wafrah-backups/wafrah-pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).dump"
unset DIRECT_URL
```

Encrypt/store offsite backups securely and **never commit `.dump` or `.sql` backup files inside the git repository**.

### 4.3 Testing a Restore on a Scratch Database

Run a restore drill before launch, before major migrations, and monthly during the pilot:

```bash
# Target a disposable scratch DB (e.g., fresh local DB or provider staging branch — NEVER production!)
export SCRATCH_DB_URL="postgresql://postgres@localhost:5432/wafrah_restore_test"
createdb wafrah_restore_test

pg_restore \
  --dbname="$SCRATCH_DB_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  "$HOME/wafrah-backups/wafrah-pre-deploy-YYYYMMDDTHHMMSSZ.dump"

# Verify schema, applied migrations, and row counts
psql "$SCRATCH_DB_URL" -c 'SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 5;'
psql "$SCRATCH_DB_URL" -c 'SELECT COUNT(*) AS restaurants FROM "Restaurant"; SELECT COUNT(*) AS waste_rows FROM "WasteEntry"; SELECT COUNT(*) AS leads FROM "Lead";'

# Tear down scratch DB when verified
dropdb wafrah_restore_test
unset SCRATCH_DB_URL
```

### 4.4 Rolling Back a Bad Migration

| Scenario | Recovery Steps |
| :--- | :--- |
| **1. `prisma migrate deploy` failed partway** | 1. Inspect `_prisma_migrations` (`finished_at IS NULL`) and database state via `psql "$DIRECT_URL"`.<br>2. Manually revert or safely complete any partial DDL from that failed migration script inside a transaction.<br>3. Mark the failed attempt as rolled back so Prisma unlocks future deploys: `DIRECT_URL="..." pnpm exec prisma migrate resolve --rolled-back "<migration_folder_name>"`.<br>4. Fix the migration locally, verify on a scratch restore (Section 4.3), and re-run `pnpm db:migrate:deploy`. |
| **2. Migration succeeded, but newly deployed app broke** | Because Release N migrations follow **Expand-Only** rules (Section 2.3), click **Instant Rollback** in Vercel to restore Release N-1 immediately without touching the database. Then create a new **forward-fix migration** locally via `pnpm db:migrate`. |
| **3. Destructive DDL or bad backfill corrupted data** | Use provider **PITR / Branch Restore** (or `pg_restore` from your pre-migration dump into a fresh database/branch), verify row counts and integrity, and repoint `DATABASE_URL` / `DIRECT_URL` only after validating no tenant data was silently lost. *(Do not guess or manually edit `_prisma_migrations` checksums on production.)* |

---

## 5. Never Do This in Production

- **Never** run `prisma db push` against production or staging (can drop columns/tables and bypass `_prisma_migrations`).
- **Never** run `prisma migrate dev` or `prisma migrate reset` against non-local databases (`migrate reset` wipes all data; `migrate dev` creates shadow DBs and dev migrations).
- **Never** run `pnpm db:seed` against production or real-customer staging ([`prisma/seed.ts`](file:///Users/frederickdineen/wafrah/prisma/seed.ts) inserts demo restaurants and known test credentials, and now refuses production).
- **Never** enable automatic `prisma migrate deploy` on Vercel Preview or PR builds.
- **Never** drop/rename active columns or tables in the same release that switches application code off them.
- **Never** run `pg_dump` or `pg_restore` through a transaction pooler (`:6543` / `-pooler`).
- **Never** store `DIRECT_URL`, `ADMIN_PASSWORD`, or `DATABASE_URL` in git, logs, or Vercel Preview variables pointing at production.
- **Never** log `ADMIN_EMAIL` or `ADMIN_PASSWORD` when running `pnpm db:seed:prod`.

---

## 6. Managed PostgreSQL & Vercel Region Comparison (Saudi Pilot)

> [!CAUTION]
> **Verified Constraints & March 2026 Infrastructure Incidents (Research Checked via Official Pages):**
> 1. **Neon & Supabase lack Middle East regions:** As of verification against [Neon Regions](https://neon.com/docs/introduction/regions) and [Supabase Regions](https://supabase.com/docs/guides/platform/regions), **neither Neon nor Supabase lists any region in Saudi Arabia or the GCC**. Neon's nearest active region is **Frankfurt (`aws-eu-central-1`)** (no Mumbai in Neon's AWS list; Azure regions are deprecated). Supabase's nearest regions are **Frankfurt (`eu-central-1`)** and **Mumbai (`ap-south-1`)**.
> 2. **AWS Middle East March 2026 outages:** Public [AWS Service Health](https://health.aws.amazon.com/health/status) incident reporting in **March 2026** documented severe physical damage from regional conflict strikes hitting **`me-central-1` (UAE)** (`mec1-az2` / `mec1-az3`) and **`me-south-1` (Bahrain)** — including extended multi-month recovery notices in `me-central-1` and multi-AZ unrecoverable resource losses in `me-south-1` with AWS advising customers to fail over workloads to alternate regions. AWS also announced an upcoming Saudi Arabia region targeted for December 2026 ([AWS Regions](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html)), which was not yet active in the standard AWS region table when checked.
> 3. **Vercel `dxb1` availability history:** [Vercel Edge Network Regions](https://vercel.com/docs/edge-network/regions) and [Vercel Functions Regions](https://vercel.com/docs/functions/configuring-functions/region) list **`dxb1` (Dubai, `me-central-1`)**, **`fra1` (Frankfurt, `eu-central-1`)**, and **`bom1` (Mumbai, `ap-south-1`)** (Hobby allows 1 region; Pro allows up to 5; failover requires Enterprise). In early **March 2026**, UAE facility disruptions caused **`dxb1` unavailability**, temporarily blocking global deployments pushing Routing Middleware until Vercel paused `dxb1` deploys and rerouted traffic to **`bom1`**. [Vercel Status](https://www.vercel-status.com) subsequently showed `dxb1` operational, but Dubai infrastructure resilience remains an operational risk factor.

### Provider Comparison for a 15-Restaurant Pilot

| Provider | Regions Near Saudi Arabia | Serverless Pooling Support | Backups & PITR | Pilot Pricing Tier (15 Restaurants) | Official Source URLs |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Neon Serverless Postgres** | **Frankfurt (`aws-eu-central-1`)** *(nearest)*. **No Middle East or Mumbai region** (Azure deprecated). | **Built-in PgBouncer** (`-pooler` hostname for `DATABASE_URL`; separate non-pooler hostname for `DIRECT_URL`; up to `10,000` client conns). | **Included on paid plans:** Launch includes up to **7-day WAL history PITR** + scheduled snapshots (Scale: 30 days; Free: 6 hrs / pauses after 5 min idle). | **Launch Plan** usage-based: **\$0.106 / CU-hour** compute + **\$0.35 / GB-month** storage, no fixed minimum (~low-tens USD/mo for light 15-restaurant pilot, depending on scale-to-zero settings). | [Regions](https://neon.com/docs/introduction/regions), [Pricing](https://neon.com/pricing), [Backup & Restore](https://neon.com/docs/guides/backup-restore), [Pooling](https://neon.com/docs/connect/connection-pooling) |
| **Supabase Postgres** | **Frankfurt (`eu-central-1`)** & **Mumbai (`ap-south-1`)**. **No Middle East region.** | **Built-in Supavisor** (`:6543` transaction pooler for `DATABASE_URL`) + Dedicated PgBouncer on Pro+; `:5432` direct for `DIRECT_URL` (IPv6 / IPv4 caveats on direct vs pooler). | **Pro (\$25/mo):** automated **daily backups** (7-day retention). **PITR is an extra paid add-on** (starts **~\$100/mo** for 7-day PITR + requires Small+ compute). Free pauses after 7 days with no auto-backups. | **Pro Plan (\$25/mo base)** includes **\$10/mo** compute credit covering 1 Micro instance (\$10/mo, 200 pooler conns); adding Small compute (\$15/mo, net \$5/mo over credit) + PITR pushes cost to ~\$130+/mo. | [Regions](https://supabase.com/docs/guides/platform/regions), [Pricing](https://supabase.com/pricing), [Backups](https://supabase.com/docs/guides/platform/backups), [Connecting](https://supabase.com/docs/guides/database/connecting-to-postgres) |
| **AWS RDS for PostgreSQL** | **`me-central-1` (UAE)** & **`me-south-1` (Bahrain)** — **both suffered severe March 2026 physical/multi-AZ disruptions**; upcoming KSA region announced for Dec 2026 (not yet live). Otherwise **`eu-central-1` (Frankfurt)** or **`ap-south-1` (Mumbai)**. | **Not built-in** to RDS Postgres; requires provisioning **Amazon RDS Proxy** separately (billed per underlying vCPU-hour) to prevent serverless connection exhaustion. | Automated daily snapshots (up to 35 days) + **5-minute PITR** built in; automated backup storage free up to 100% of allocated DB storage. | `db.t4g.micro` single-AZ starts around **\$0.019/hr** (~\$14/mo) in `me-central-1` (Multi-AZ ~2x) + `gp3` storage + **Amazon RDS Proxy** hourly vCPU surcharge (US baseline ~\$0.015/vCPU-hr, min 2 vCPUs = ~\$22+/mo extra; check pricing calculator for ME rate). | [AWS Regions](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html), [RDS Pricing](https://aws.amazon.com/rds/postgresql/pricing/), [RDS Proxy Pricing](https://aws.amazon.com/rds/proxy/pricing/), [AWS Health](https://health.aws.amazon.com/health/status) |
| **Google Cloud SQL for PostgreSQL** | **`me-central2` (Dammam, Saudi Arabia)** — live **in-Kingdom** region *(note: KSA customers provision via exclusive reseller **CNTXT**; non-KSA accounts require Invoiced Billing)*. | **Managed Connection Pooling** (port `6432`) available natively on supported editions; public/serverless access requires Cloud SQL Auth Proxy, authorized TLS/networks, or PSC/VPC connector. | Automated daily backups + **7-day PITR** (backup storage ~**\$0.08 / GiB-month** standard baseline + compute/storage). | Dedicated vCPU/RAM (**Enterprise** / **Enterprise Plus**) + HA standby (optional) + disk + backup storage; typically higher baseline cost & procurement overhead than Neon/Supabase for a 15-site pilot. | [Cloud SQL Locations](https://cloud.google.com/sql/docs/postgres/locations), [Managed Pooling](https://cloud.google.com/sql/docs/postgres/managed-connection-pooling), [Cloud SQL Pricing](https://cloud.google.com/sql/pricing) |

### Recommended Choice for the 15-Restaurant Pilot

1. **Primary Technical Recommendation (once legal counsel signs off on cross-border transfer, or for a synthetic/non-personal-data pilot):**
   - **Database:** **Neon (Launch Plan) in `aws-eu-central-1` (Frankfurt)**
   - **Vercel Compute Region:** **`fra1` (Frankfurt)** (on Vercel Pro; **avoid pinning single-region exclusively to `dxb1`** until Middle East regional stability is established, or pair with verified connectivity).
   - **Why:**
     - Zero-config serverless PgBouncer (`-pooler`) + separate unpooled `DIRECT_URL` designed directly for Vercel + Prisma v6.
     - Co-located inside AWS `eu-central-1` with Vercel `fra1`, keeping DB-to-function query round-trips minimal (~1–3 ms) instead of paying WAN round-trips across every Prisma query on multi-query routes.
     - Launch plan includes **7-day PITR** and scheduled snapshots at pay-as-you-go pricing without Supabase's `~$100/mo` PITR surcharge or AWS RDS Proxy management overhead, plus instant copy-on-write database branching for isolated PR Preview / staging tests.
     - Avoids the March 2026 physical-outage risk observed in AWS `me-central-1` / `me-south-1` and Vercel `dxb1`.
2. **In-Kingdom Fallback (if Saudi legal counsel prohibits storing personal data outside KSA under PDPL):**
   - **Database:** **Google Cloud SQL for PostgreSQL in `me-central2` (Dammam, Saudi Arabia)** provisioned via **CNTXT**, using Cloud SQL **Managed Connection Pooling (`6432`)** and TLS/IP-restricted or private connectivity.
   - **Caveat:** Vercel Functions still execute outside Saudi Arabia (nearest `dxb1` or `fra1`), so legal counsel must still evaluate transient personal-data processing in Vercel Functions and transactional email delivery in Resend.

### What Is Unknown & Must Be Verified Before Production Cutover

- **Actual tablet-to-app-to-DB RTT from KSA:** Synthetic/live network latency from restaurant Wi-Fi / 4G/5G in Makkah, Jeddah, and Riyadh to `vercel fra1 -> eu-central-1` vs `vercel dxb1 -> me-central2` has **not** been measured and must be benchmarked with real kitchen devices.
- **Exact pilot monthly spend:** Actual Neon CU-hours under 15 restaurants + 3 daily/weekly/monthly Vercel crons (plus whether `scale-to-zero` stays disabled to prevent cold-wake spikes during pre-Fajr `MORNING` shift login), and exact **CNTXT / Google Cloud SQL `me-central2`** commercial quote.
- **Current operational/onboarding limits in AWS `me-central-1` (`UAE`) and future KSA AWS region:** Post-March 2026 `me-central-1` detailed recovery notices transitioned behind AWS Personal Health Dashboard, and AWS's announced Saudi Arabia region (targeted December 2026) was not yet GA in the region docs.
- **Final legal determination under Saudi PDPL:** Whether anonymized/pseudonymized kitchen SKUs vs real staff names/emails/lead phones permit `eu-central-1` hosting under Standard Contractual Clauses or require full in-Kingdom compute + DB + SMTP.
