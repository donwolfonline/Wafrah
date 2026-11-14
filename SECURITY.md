# Wafrah Security & Privacy Hardening Report

This document summarizes the security audit, hardening changes implemented, dependency audit findings (`pnpm audit`), known architectural tradeoffs, and remaining items recommended for an independent professional security review.

---

## 1. Audit & Hardening Summary

### 1.1 Route Handlers (25/25 Verified & Hardened) & Server Actions (3/3)

Every Next.js Route Handler and `"use server"` module requires explicit server-side authentication, RBAC role verification, Zod input validation, and strict tenant scoping (`getTenantDb` / `getPlatformAdminDb`, never trusting client-supplied `tenantId`):

| Surface | Auth & Role Guard | Validation & Tenant Scoping | Hardening Applied |
| --- | --- | --- | --- |
| `src/app/api/auth/[...nextauth]/route.ts` | Auth.js v5 Credentials | Zod `managerLoginSchema` / `staffPinLoginSchema` | Integrated manager lockout (`10` failures / `30m`), PIN lockout (`5` failures / `15m`), audit logs |
| `src/app/api/cron/{daily,weekly,forecast,insights,monthly}/route.ts` & `/api/health/deep` | `authorizeCronRequest` (`Authorization: Bearer <CRON_SECRET>`, SHA-256 + `timingSafeEqual`; `500` if unset, `401` otherwise) | `CronNowBodySchema` / `MonthlyCronBodySchema` | Rejects placeholder `replace-with-cron-secret` with `500` in `NODE_ENV=production`; `maxDuration = 300` + 80% budget cutoff & skipped-tenant resume |
| `src/app/api/waste-entries/route.ts` | `requireRole("waste.create")` | `createWasteEntrySchema` / `undoWasteEntrySchema` + `getTenantDb` | Role check & `checkApiWriteRateLimit` moved **before** `request.json()` on `POST`/`DELETE` |
| `src/app/api/menu/route.ts` | `requireRole("menu.manage")` | `menuItemInputSchema` + `getTenantDb` | `requireRole` & `checkApiWriteRateLimit` moved **before** `request.json()` on `POST` |
| `src/app/api/imports/route.ts` | `requireRole("sales.import")` | `getTenantDb` | Verified existing role + tenant guard |
| `src/app/api/imports/templates/route.ts` | `requireRole("sales.import")` | `TemplateQuerySchema` (`SALES`/`PURCHASES`, `ar`/`en`) | Added `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` |
| `src/app/api/imports/parse/route.ts` | `requireRole("sales.import")` | `FormTypeSchema` / `ParseJsonRequestSchema` + `getTenantDb` | Auth & upload rate limit (`10/min`) before body read; 5 MB limit; filename sanitization; extension/MIME/magic checks; hardened XLSX/ZIP parsing |
| `src/app/api/imports/confirm/route.ts` | `requireRole("sales.import")` | `ConfirmImportRequestSchema` + `getTenantDb` | Auth & write rate limit (`60/min`) before body read; 5 MB payload cap; formula-safe rejected CSV |
| `src/app/api/dashboard/route.ts` | `requireRole(["MANAGER","OWNER"])` | `getTenantDb` | Verified existing role + tenant guard |
| `src/app/api/dashboard/alerts/[id]/route.ts` | `requireRole(["MANAGER","OWNER"])` | `AlertIdSchema` + `PatchAlertSchema` + `getTenantDb` | Tightened from `insights.read` to `MANAGER`/`OWNER`; Zod validation on `id`; `TenantIsolationError` handler; write rate limit |
| `src/app/api/reports/[month]/csv/route.ts` | `requireRole(["MANAGER","OWNER"])` | `ReportParamsSchema` (`YYYY-MM`, `ar`/`en`) + `getTenantDb` | Boundary auth/Zod param validation; `TenantIsolationError` handler; shared formula-safe CSV helper; `nosniff` |
| `src/app/api/reports/baseline/route.ts` | `requireRole(["MANAGER","OWNER"])` | `BaselineUpdateSchema` + `getTenantDb` | Auth & write rate limit before `request.json()`; `TenantIsolationError` handler |
| `src/app/api/notifications/preferences/route.ts` | `requireRole(["MANAGER","OWNER"])` | `NotificationPreferencesSchema` + `getTenantDb` | Auth & write rate limit before `request.json()`; `TenantIsolationError` handler |
| `src/app/api/export/route.ts` | `requireRole(["MANAGER","OWNER"])` | `getTenantDb` | New PDPL ZIP-of-CSVs export across all 14 tenant models without credential hashes; rate-limited (`10/min`); `Cache-Control: no-store` |
| `src/app/api/admin/route.ts` & `/api/admin/overview` | `requireRole("admin.*")` | `getPlatformAdminDb` | Verified `PLATFORM_ADMIN`-only enforcement |
| `src/app/api/admin/restaurants/route.ts` & `/[id]/{diagnostics,subscription,suspend}` | `requireRole("admin.*")` | `restaurantIdSchema`, `createRestaurantSchema`, `updateSubscriptionSchema`, `suspendRestaurantSchema` | Added `restaurantIdSchema` Zod param check & `checkApiWriteRateLimit` on all write endpoints; handles `TenantIsolationError` / `ZodError` |
| `src/app/api/admin/restaurants/[id]/delete/route.ts` | `requireRole("admin.*")` | `restaurantIdSchema` + `deleteRestaurantSchema` + exact name check | New PDPL deletion endpoint: rate-limited, transactional delete of tenant + `WasteEntry` + tenant `AuditLog`, non-PII `ADMIN_RESTAURANT_DELETED` log |
| `src/features/auth/actions.ts` | Server Actions (`loginManagerAction`, `loginStaffAction`, `logoutAction`) | `managerLoginSchema`, `staffPinLoginSchema`, `logoutModeSchema` | Rate-limited manager & PIN auth; caps `STAFF` cookie `maxAge` to 12h; Zod mode check & `AUTH_LOGOUT` audit log |
| `src/features/menu/actions.ts` | `requireRole("menu.manage")` | Zod item schemas + `getTenantDb` | Added `checkApiWriteRateLimit` before executing menu mutations |
| `src/i18n/actions.ts` | Public locale toggle (`ar`/`en`) | `setLocaleSchema` + `getTenantDb`/`getPlatformAdminDb` when signed in | Marked `NEXT_LOCALE` `httpOnly: true`, `sameSite: "lax"`, conditional `secure` |

Additionally:
- `src/middleware.ts` and `src/features/auth/session.ts` fail closed if Auth.js attaches an `error` property on the session object (mitigating `GHSA-8fpg-xm3f-6cx3`).
- `src/lib/authz-rules.ts` grants unauthenticated access to `/privacy` and `/terms` and restricts `/api/export` strictly to `MANAGER` and `OWNER`.

---

### 1.2 Security Headers (`next.config.ts`)

Applied globally to `/(.*)`:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (sent in `NODE_ENV=production` unless `APP_URL` is explicit `http://localhost` / `http://127.0.0.1`)
- `Content-Security-Policy`:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
  - `style-src 'self' 'unsafe-inline'`
  - `img-src 'self' blob: data:`
  - `font-src 'self'`
  - `object-src 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`
  - `frame-ancestors 'none'`
  - `connect-src 'self'`
  - `worker-src 'self'` (for `public/sw.js` service worker)
  - `manifest-src 'self'`
  - `upgrade-insecure-requests` (enabled only in `NODE_ENV=production` when `APP_URL` starts with `https://`)

---

### 1.3 Rate Limiting (`src/lib/rate-limit.ts`, `src/lib/api-rate-limit.ts`)

- **Staff PIN login (`checkPinRateLimit`):** 5 failed attempts -> 15-minute lockout keyed by normalized IP and `(restaurantCode, username)`.
- **Manager / Admin password login (`checkManagerRateLimit`):** 10 failed attempts -> 30-minute lockout keyed by normalized IP and normalized login identifier.
- **Import upload & data export (`checkImportUploadRateLimit`):** 10 requests per 60-second sliding window per user/IP (`429` with `Retry-After`).
- **API write endpoints (`checkApiWriteRateLimit`):** 60 requests per 60-second sliding window per user/IP across `/api/waste-entries`, `/api/menu`, `menu/actions.ts`, `/api/imports/confirm`, `/api/dashboard/alerts/[id]`, `/api/reports/baseline`, `/api/notifications/preferences`, and `/api/admin/**` write endpoints.

**Serverless Tradeoff:** Both limiters use bounded in-memory `Map` stores (`MAX_BUCKET_ENTRIES = 10,000`) to stay dependency-light without requiring Redis. In multi-instance serverless deployments (e.g., multiple concurrent Vercel functions), each warm isolate maintains independent counters; brute-force attackers rotating across cold/warm instances are only bounded per isolate until migrated to a shared Redis / Upstash KV backend.

---

### 1.4 Cookies & Session Lifetimes (`src/features/auth/session-policy.ts`, `config.ts`)

- All Auth.js cookies (`sessionToken`, `csrfToken`, `callbackUrl`) and `NEXT_LOCALE` set `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, and `secure: true` (with `__Secure-` / `__Host-` prefixes) in non-localhost production deployments.
- **Role-specific lifetimes (`applyJwtSessionPolicy` & JWE `maxAge` cap):**
  - `STAFF` (shared kitchen devices): **12 hours fixed** from login (`43,200` seconds), no sliding extension on activity; rejected and cleared cleanly after expiry. `loginStaffAction` also caps the browser cookie `maxAge` to 12 hours.
  - `MANAGER` / `OWNER` / `PLATFORM_ADMIN`: **7 days (`604,800` seconds) with sliding refresh** in the JWT callback when requests occur prior to expiry.
- **Host trust & redirect safety (`src/features/auth/config.ts`, `src/features/auth/host-policy.ts`):** `trustHost: shouldTrustAuthHost(env)` defaults to `true` across Vercel Preview/Production (honoring `AUTH_TRUST_HOST="false"` explicitly) so Auth.js accepts Vercel reverse-proxy headers (`x-forwarded-host`, `x-forwarded-proto`), while `callbacks.redirect` (`resolveSafeAuthRedirectUrl`) rejects protocol-relative `//host` and untrusted external origins.
- **Non-production crawler blocking (`next.config.ts`, `src/proxy.ts`, `src/app/robots.ts`):** Whenever `VERCEL_ENV !== "production"`, every response includes `X-Robots-Tag: noindex, nofollow` and `/robots.txt` disallows everything (`Disallow: /`); in `VERCEL_ENV === "production"`, landing routes are indexable while `/dashboard`, `/log`, `/admin`, `/login`, `/menu`, `/imports`, `/reports`, `/settings`, `/design-check`, and `/api` remain `noindex, nofollow`.

---

### 1.5 Upload Safety (`src/features/sales/import-files.ts`, `src/lib/zip.ts`, `xlsx.ts`)

- Size limit lowered from 10 MB to **5 MB (`MAX_IMPORT_UPLOAD_BYTES = 5 * 1024 * 1024`)**, enforced via `Content-Length` pre-check, multipart file size/buffer checks, pasted CSV byte check, and raw JSON request size check.
- Filename path stripping & control-character sanitization (`sanitizeUploadFileName`).
- Strict extension allowlist (`.csv`, `.tsv`, `.txt`, `.xlsx`), MIME compatibility check, and dangerous magic-byte rejection (`MZ` executables, ELF binaries, `%PDF-`, PNG/JPEG/GIF, HTML/SVG/`<script>`, `#!` shebangs, binary NULs inside UTF-8 CSV, ZIP-in-`.csv` spoofing).
- Hardened XLSX/ZIP parser (`src/lib/zip.ts`): max `256` entries, rejects `..` / path traversal in entry names & `.rels` targets, enforces `inflateRawSync` `maxOutputLength` (`20 MB` per entry, `50 MB` total) to defeat decompression bombs.
- Uploaded files are processed in memory only and **never written to disk or served statically**. Downloadable rejected CSVs neutralize Excel formulas (`=`, `+`, `-`, `@`) via `src/lib/csv.ts`.

---

### 1.6 Secrets & Environment Hygiene

- Checked all `process.env` usage across `src/`, `prisma/`, configs, and scripts: all 6 runtime variables (`DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`) are documented in `.env.example`.
- `.gitignore` excludes `.env` and `.env.*` (except `.env.example`).
- No repository commits exist yet; source grep confirmed zero production secrets committed in `src/` (only seed/E2E demo credentials in `prisma/seed-data.ts` and `e2e/`).

---

## 2. Dependency Audit (`pnpm audit`)

Running `pnpm audit --json` identified **15 advisories**, of which **9 are High or Critical** (none altered automatically because `AGENTS.md` requires user approval before editing `package.json`):

| Severity | Package & Installed Version | Advisory | Patched Version / Status & Mitigation in Wafrah |
| --- | --- | --- | --- |
| **Critical** | `next-auth` (`5.0.0-beta.30`) | `GHSA-8fpg-xm3f-6cx3` — Configuration error can cause existence-based auth checks to fail open | No upstream patch yet (`<=5.0.0-beta.31`). Mitigated in `src/middleware.ts` & `src/features/auth/session.ts` by failing closed when `session.error` is set or `userId`/`role` is missing. |
| **Critical** | `next-auth` (`5.0.0-beta.30`) | `GHSA-7rqj-j65f-68wh` — Email normalizer validates before Unicode normalization (homoglyph `@`) | No upstream `next-auth` release yet (fixed in `@auth/core >=0.41.3`). Wafrah does not use the Email provider; manager inputs go through Zod `.toLowerCase().email()`. |
| **Critical** | `@auth/core` (`0.41.0`, transitive) | `GHSA-7rqj-j65f-68wh` — Email normalizer homoglyph bypass | Patched in `@auth/core >=0.41.3`; not used (Credentials only). |
| **Critical** | `tinypool` (`1.1.1`, devDep via `vitest`) | `GHSA-5gmw-xhrv-c9v3` — Prototype Pollution to RCE | Patched in `>=2.1.2`; dev/test dependency only (never bundled in production). |
| **Critical** | `tinypool` (`1.1.1`, devDep via `vitest`) | `GHSA-85c8-ppgw-ccpr` — Prototype Pollution via run options | Patched in `>=2.1.2`; dev/test dependency only. |
| **High** | `next-auth` (`5.0.0-beta.30`) | `GHSA-xmf8-cvqr-rfgj` — `getToken()` throws on malformed Bearer header | Fixed in `@auth/core >=0.41.3`. Wafrah does not call `getToken()`. |
| **High** | `@auth/core` (`0.41.0`, transitive) | `GHSA-xmf8-cvqr-rfgj` — `getToken()` throws on malformed Bearer header | Patched in `>=0.41.3`; Wafrah does not call `getToken()`. |
| **High** | `deepmerge-ts` (`7.1.5`, via `prisma`/`@prisma/config`) | `GHSA-ggr8-5vv4-36mx` — Stack exhaustion on deep recursive objects | Patched in `>=8.0.0`; used only by Prisma CLI config tooling, not exposed to untrusted user requests. |
| **High** | `zod` (`3.25.76`) | `GHSA-mrhx-c7xc-m3w5` — Memory exhaustion on oversized constrained collections | Patched in `zod >=4.6.6` (major upgrade requiring migration review). Mitigated by enforcing 5 MB request caps & bounded `.max()` array constraints before Zod parsing. |

---

## 3. Known Limitations & Recommendations for Professional Review

1. **CSP Nonces (`script-src 'unsafe-inline' 'unsafe-eval'`):** Next.js App Router inline hydration scripts and Recharts styling currently rely on `'unsafe-inline'` and `'unsafe-eval'`. Migrate to per-request cryptographic nonces via middleware + strict dynamic CSP in a dedicated pre-production hardening pass.
2. **Distributed Rate Limiting:** Replace the in-memory `Map` stores in `src/lib/rate-limit.ts` and `src/lib/api-rate-limit.ts` with Redis / Upstash KV before scaling horizontally across multiple serverless instances, and validate trusted reverse-proxy IP headers (`x-forwarded-for`).
3. **`next-auth` v5 Beta Status & Dependency Upgrades:** Plan a coordinated dependency upgrade (with user approval per `AGENTS.md`) once stable Auth.js v5 / `@auth/core >=0.41.3`, `zod >=4.6.6`, and `vitest`/`tinypool` updates are validated against the full E2E suite.
4. **Account Lockout Audit Privacy & Enumeration:** Login failure audit logs store attempted identifier/IP for forensics; review retention/masking policy and verify uniform response timings across login errors with penetration testers.
5. **Legal & PDPL Sign-Off:** `/privacy` and `/terms` intentionally display `"TO BE REPLACED BY LEGAL TEXT"`. Obtain Saudi legal counsel review to draft PDPL notices, controller/processor clauses, hosting residency documentation (`DATA.md`), and exact retention schedules before public launch.
6. **Admin Credential Rotation & 2FA:** Add TOTP/WebAuthn MFA for `PLATFORM_ADMIN` and `OWNER` accounts before onboarding production hospitality customers.
