# Wafrah Vercel Serverless Readiness Audit & Fixes

This document records the Vercel serverless deployment readiness audit across all seven requested areas, the fixes implemented in this repository, and the remaining operator decisions required before deploying to Vercel.

---

## 1. Build & Package Configuration

- **Findings:**
  - `package.json` had no `"packageManager"` or `"engines"` pins, and `"build"` ran `next build --webpack` without generating Prisma Client first.
  - Prisma configuration lived in the deprecated `package.json#prisma` field, emitting deprecation warnings during Prisma CLI invocations.
  - `pnpm` v12 (`pnpm@12.18.0`) uses `pnpm-workspace.yaml` (`allowBuilds`) to gate lifecycle build scripts for `@prisma/client`, `@prisma/engines`, and `prisma`.
- **Fixes Applied:**
  - Updated [package.json](file:///Users/frederickdineen/wafrah/package.json): added `"packageManager": "pnpm@12.18.0"`, `"devEngines": { "packageManager": { "name": "pnpm", "version": "12.18.0", "onFail": "ignore" } }`, `"engines": { "node": "22.x" }`, `"postinstall": "prisma generate"`, and `"build": "prisma generate && next build --webpack"`, and removed `"prisma"`.
  - Created [prisma.config.ts](file:///Users/frederickdineen/wafrah/prisma.config.ts) using Node's built-in `process.loadEnvFile` (zero new dependencies) pointing at `prisma/schema.prisma`, `prisma/migrations`, and `prisma/seed.ts`.
  - Kept [pnpm-workspace.yaml](file:///Users/frederickdineen/wafrah/pnpm-workspace.yaml) configured with `verifyDepsBeforeRun: false` and explicit `allowBuilds` (`"@prisma/client": true`, `"@prisma/engines": true`, `"prisma": true`).
- **Status:** Fixed and verified (`pnpm build` passes with zero Prisma config deprecation warnings and zero `middleware`/Edge Runtime warnings).

---

## 2. Serverless State Safety (Rate Limiters & PIN Lockouts)

- **Findings:**
  - Three in-memory `Map`-backed stores tracked critical correctness/security state per Node process:
    1. PIN and manager login lockout counters in [rate-limit.ts](file:///Users/frederickdineen/wafrah/src/lib/rate-limit.ts).
    2. API upload/write fixed-window limiters in [api-rate-limit.ts](file:///Users/frederickdineen/wafrah/src/lib/api-rate-limit.ts).
    3. Lead form anti-spam IP limiter in [rate-limit.ts](file:///Users/frederickdineen/wafrah/src/features/leads/rate-limit.ts).
  - Across ephemeral Vercel serverless instances, in-memory `Map` state resets per cold start and is not shared across concurrent lambdas.
- **Fixes Applied (Zero New Dependencies):**
  - Added the non-tenant `RateLimitBucket` model (`key`, `count`, `windowStart`, `expiresAt`, `updatedAt`, `@@index([expiresAt])`) in [schema.prisma](file:///Users/frederickdineen/wafrah/prisma/schema.prisma), registered it in `PLATFORM_ONLY_MODELS` inside [tenant-helpers.ts](file:///Users/frederickdineen/wafrah/src/lib/tenant-helpers.ts), and generated migration `20261114193818_add_rate_limit_buckets`.
  - Built [rate-limit-store.ts](file:///Users/frederickdineen/wafrah/src/lib/rate-limit-store.ts) with atomic PostgreSQL `INSERT ... ON CONFLICT ("key") DO UPDATE ... RETURNING` operations (`consumeFixedWindowBucket`, `getLockoutBucketStates`, `recordLockoutFailureBucket`, `deleteRateLimitBucketsByKeys`, `deleteRateLimitBucketsByPrefix`, `cleanupExpiredRateLimitBuckets`).
  - Converted all three rate limiters to async Postgres-backed implementations and updated every server/API caller to `await` them.
  - Added `cleanupExpiredRateLimitBuckets(now)` execution to `runDailyCronJob` in [cron-daily.ts](file:///Users/frederickdineen/wafrah/src/features/notifications/cron-daily.ts), reporting `rateLimitBucketsCleaned` in cron summaries ([types.ts](file:///Users/frederickdineen/wafrah/src/features/notifications/types.ts)).
- **Status:** Fixed and covered by unit/concurrency tests ([rate-limit-store.test.ts](file:///Users/frederickdineen/wafrah/src/lib/rate-limit-store.test.ts), [rate-limit.test.ts](file:///Users/frederickdineen/wafrah/src/lib/rate-limit.test.ts), [security-rate-limit.test.ts](file:///Users/frederickdineen/wafrah/src/lib/security-rate-limit.test.ts), [leads.test.ts](file:///Users/frederickdineen/wafrah/src/features/leads/leads.test.ts), [cron-jobs.test.ts](file:///Users/frederickdineen/wafrah/src/features/notifications/cron-jobs.test.ts)).

---

## 3. Runtime Filesystem Writes & Long-Running Request Handlers

- **Findings:**
  - Audited `src/` for `fs`, `node:fs`, and `fs/promises` imports: zero runtime modules read or write disk files (only test files [landing-seo.test.ts](file:///Users/frederickdineen/wafrah/src/features/landing/landing-seo.test.ts) and [smoke.test.ts](file:///Users/frederickdineen/wafrah/src/lib/smoke.test.ts) import `node:fs`).
  - Upload parsing in [parse/route.ts](file:///Users/frederickdineen/wafrah/src/app/api/imports/parse/route.ts) processes uploads completely in memory via `Buffer.from(await rawFile.arrayBuffer())` enforced under `MAX_IMPORT_UPLOAD_BYTES` (5 MB).
  - `/api/imports/parse` and `/api/imports/confirm` lacked explicit serverless timeout budgets (`maxDuration`).
- **Fixes Applied:**
  - Added `export const dynamic = "force-dynamic";` and `export const maxDuration = 60;` to [parse/route.ts](file:///Users/frederickdineen/wafrah/src/app/api/imports/parse/route.ts) and [confirm/route.ts](file:///Users/frederickdineen/wafrah/src/app/api/imports/confirm/route.ts), matching [export/route.ts](file:///Users/frederickdineen/wafrah/src/app/api/export/route.ts) and all `/api/cron/*` routes (`daily`, `weekly`, `monthly`, `forecast`, `insights`).
- **Status:** Fixed and verified. *(Check Vercel plan `maxDuration` ceiling before go-live; Vercel Hobby caps functions below 60s unless Fluid Compute is enabled/configured.)*

---

## 4. Prisma Client Singleton

- **Findings & Fixes Applied:**
  - Verified [db.ts](file:///Users/frederickdineen/wafrah/src/lib/db.ts) caches the `PrismaClient` instance on `globalThis` (both across hot-reloads in dev and across warm serverless invocations in production) rather than instantiating a client per request.
  - Updated `isCachedClientCurrent` to validate `"rateLimitBucket" in cachedClient` alongside existing models so stale dev HMR clients refresh cleanly after schema changes.
- **Status:** Verified.

---

## 5. Dev-Only Code Exclusion & Next.js 16 Proxy Migration

- **Findings:**
  - `src/middleware.ts` used the legacy Middleware convention rather than Next.js 16 Node `proxy.ts`, and production checks needed to honor both `VERCEL_ENV === "production"` and `NODE_ENV === "production"`.
- **Fixes Applied:**
  - Replaced `src/middleware.ts` with Node.js [proxy.ts](file:///Users/frederickdineen/wafrah/src/proxy.ts) (`export const proxy = auth(...)`), forwarding `x-request-id` on requests/responses and returning HTTP `404` for `/design-check` and `/design-check/*` when `isProductionRuntime()` is true.
  - Updated `isProductionRuntime()` in [app-url.ts](file:///Users/frederickdineen/wafrah/src/lib/app-url.ts) to return `true` when `VERCEL_ENV === "production" || NODE_ENV === "production"`.
  - Updated [page.tsx](file:///Users/frederickdineen/wafrah/src/app/design-check/page.tsx) (`export const dynamic = "force-dynamic"`, `notFound()` when `VERCEL_ENV === "production" || NODE_ENV === "production"`), [authz-rules.ts](file:///Users/frederickdineen/wafrah/src/lib/authz-rules.ts), and [seed.ts](file:///Users/frederickdineen/wafrah/prisma/seed.ts) to enforce the same guard.
  - Added production-guard tests in [page.test.ts](file:///Users/frederickdineen/wafrah/src/app/design-check/page.test.ts) and [app-url.test.ts](file:///Users/frederickdineen/wafrah/src/lib/app-url.test.ts).
- **Status:** Fixed and verified.

---

## 6. PWA Service Worker & Offline Queue Safety

- **Findings:**
  - A static `public/sw.js` risked stale browser caching, unversioned cache names, and hard `skipWaiting()` disruptions during live sessions.
- **Fixes Applied:**
  - Removed static `public/sw.js` and replaced it with dynamic route [route.ts](file:///Users/frederickdineen/wafrah/src/app/sw.js/route.ts) generated via [pwa.ts](file:///Users/frederickdineen/wafrah/src/lib/pwa.ts), returning `Cache-Control: no-cache`, `Content-Type: application/javascript; charset=utf-8`, `Service-Worker-Allowed: /`, and `X-Robots-Tag: noindex, nofollow`.
  - Added build ID generation (`wafrahBuildId` -> `env: { WAFRAH_BUILD_ID }` & `generateBuildId`) and `/sw.js` `Cache-Control: no-cache` headers in [next.config.ts](file:///Users/frederickdineen/wafrah/next.config.ts).
  - Scoped SW caching (`wafrah-assets-<buildId>`) strictly to `/_next/static/*`, `/manifest.webmanifest`, `/manifest.json`, `/favicon.ico`, and static image/font extensions; explicitly bypasses `/api/*`, `/sw.js`, `_rsc` requests, HTML navigations, and authenticated pages.
  - Omitted `self.skipWaiting()` on `install` so updates activate safely on next launch without clearing IndexedDB (`wafrah-waste-queue-db` in [offline-queue.ts](file:///Users/frederickdineen/wafrah/src/features/waste/offline-queue.ts)); cleanup on `activate` only removes old `wafrah-assets-*` CacheStorage buckets.
  - Updated [service-worker-registrar.tsx](file:///Users/frederickdineen/wafrah/src/components/pwa/service-worker-registrar.tsx) to register with `updateViaCache: "none"` and show a localized toast (`common.pwaUpdateAvailable` / `common.pwaUpdateDescription` in [ar.json](file:///Users/frederickdineen/wafrah/messages/ar.json) and [en.json](file:///Users/frederickdineen/wafrah/messages/en.json)), backed by `<Toaster position="bottom-center" />` centralized in [app-shell.tsx](file:///Users/frederickdineen/wafrah/src/components/shell/app-shell.tsx).
- **Status:** Fixed and covered by unit tests in [pwa.test.ts](file:///Users/frederickdineen/wafrah/src/lib/pwa.test.ts).

---

## 7. Structured JSON Logging & PII Redaction

- **Findings:**
  - Existing code emitted unstructured `console.*` logs across API routes, crons, auth checks, and email previews without uniform `requestId`/`tenantId` correlation or centralized secret/phone redaction.
- **Fixes Applied:**
  - Created [logger.ts](file:///Users/frederickdineen/wafrah/src/lib/logger.ts) using `AsyncLocalStorage` context (`runWithLogContext`, `setLogContextFields`, `resolveRequestId`), emitting single-line JSON (`timestamp`, `level`, `event`, `requestId`, `tenantId`) and applying `maskPhoneNumber`, `redactSensitiveText`, and recursive field redaction for secrets, passwords, PINs, tokens, and full phone numbers.
  - Created [request-context.ts](file:///Users/frederickdineen/wafrah/src/lib/request-context.ts) (`withRequestContext`) and wired it into `/api/health`, `/api/feedback`, `/api/leads`, and all five `/api/cron/*` endpoints.
  - Bound `tenantId` automatically into active request log context inside `getTenantDb` ([tenant.ts](file:///Users/frederickdineen/wafrah/src/lib/tenant.ts)).
  - Migrated all remaining non-test `console.*` calls across `src/` (zero unmigrated `console.*` calls remain outside `logger.ts` and `*.test.*` files), and updated [email.ts](file:///Users/frederickdineen/wafrah/src/lib/email.ts) to redact non-production email previews and fail closed cleanly in production when `RESEND_API_KEY` is missing.
- **Status:** Fixed and verified ([logger.test.ts](file:///Users/frederickdineen/wafrah/src/lib/logger.test.ts), [notifications.test.ts](file:///Users/frederickdineen/wafrah/src/features/notifications/notifications.test.ts)).

---

## Remaining Decisions & Pre-Deploy Checklist for Operator

1. **Managed PostgreSQL Connection Strings & PDPL Residency:**
   - Provision PostgreSQL and configure **pooled `DATABASE_URL`** (PgBouncer / Supavisor) and **unpooled `DIRECT_URL`** (used at build time by [vercel-build.mjs](file:///Users/frederickdineen/wafrah/scripts/vercel-build.mjs) for `prisma migrate deploy`) per [DEPLOY.md](file:///Users/frederickdineen/wafrah/DEPLOY.md).
   - Complete legal sign-off on Saudi PDPL cross-border residency before onboarding live customer/staff PII.
2. **Vercel Plan, Regions & Cron Configuration:**
   - [vercel.json](file:///Users/frederickdineen/wafrah/vercel.json) pins `"regions": ["fra1"]` and schedules `/api/cron/daily` (`0 0 * * *`), `/api/cron/weekly` (`0 5 * * 0`), and `/api/cron/monthly` (`0 5 1 * *`) with `maxDuration = 300`, 80% budget cutoff, skipped-tenant prioritization, `Authorization: Bearer <CRON_SECRET>` (`500` when unset), and `/api/health` + `/api/health/deep`. Verify Pro upgrade before multi-tenant growth for per-minute cron precision and up to `800s` duration.
3. **Production Environment Variables (Vercel Dashboard):**
   - Configure required variables listed in [.env.example](file:///Users/frederickdineen/wafrah/.env.example) (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `APP_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `FOUNDER_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`).
   - Do **not** add `NODE_ENV=production` manually in Vercel Environment Variables (Vercel sets it automatically; overriding it skips `devDependencies`).
   - Note minor documentation drift: [DEPLOY.md](file:///Users/frederickdineen/wafrah/DEPLOY.md) line 133 still mentions `"engines": { "node": ">=20" }`, whereas [package.json](file:///Users/frederickdineen/wafrah/package.json) now pins `"engines": { "node": "22.x" }`.
4. **Initial Production Admin Bootstrap:**
   - Run `pnpm db:seed:prod` once from a trusted operator shell (without saving `SEED_ADMIN_PASSWORD` in Vercel) as documented in [DEPLOY.md](file:///Users/frederickdineen/wafrah/DEPLOY.md). Never run `pnpm db:seed` in production.
