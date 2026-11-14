# Wafrah Data Inventory & Privacy Overview (Saudi PDPL Baseline)

This document describes the personal and operational data processed by **Wafrah**, why it is collected, how long it is retained, where it is hosted, and how tenant export and deletion work. It reflects engineering controls in the codebase and is not legal advice.

---

## 1. Personal Data Stored & Minimization

Wafrah strictly minimizes personal data across both kitchen devices and manager accounts:

| User Group | Fields Stored (`User` & `NotificationPreference`) | What We Intentionally Do **Not** Collect |
| --- | --- | --- |
| **Kitchen Staff (`STAFF`)** | Display `name`, branch-scoped `username`, salted `scrypt` `pinHash`, UI `locale`, `active` status, and timestamps | No email address (`User.email` is `null`), no phone number, no National ID / Iqama, no home address, no biometric data |
| **Managers & Owners (`MANAGER`, `OWNER`)** | `name`, `username`, optional/onboarding `email`, salted `scrypt` `passwordHash`, `locale`, `active` status, and email opt-in flags (`criticalAlerts`, `weeklySummary`, `monthlyReport`) | No government IDs, no personal financial/card numbers, no location tracking |
| **Platform Admin (`PLATFORM_ADMIN`)** | `name`, `username`, `email`, salted `scrypt` `passwordHash`, `locale` | No tenant PII access outside admin onboarding & read-only aggregate counts |
| **Audit & Upload Metadata (`AuditLog`, `ImportBatch`)** | Acting `userId`, event `action`/`entity`/`entityId`, JSON metadata (including request IP on login/rate-limit security events where forwarded), and sanitized `fileName` + row counts on import batches | Raw uploaded CSV/XLSX files are processed in memory and are never persisted on disk or served back |
| **Restaurant Guests / Diners** | **None** | Zero diner names, phone numbers, receipts, loyalty profiles, or orders |

### Browser Storage Notice (`localStorage`)
- The staff PIN login form stores only the normalized restaurant branch code under `localStorage` key `wafrah.restaurantCode` on shared kitchen tablets so staff do not have to re-type their branch code before every shift. No passwords, PINs, tokens, or personal details are stored in `localStorage`.

### Credential Handling
- Passwords and PINs are hashed per-record using Node's `crypto.scryptSync` with a random 16-byte salt (`src/lib/password.ts`) and verified using `crypto.timingSafeEqual`.
- `passwordHash` and `pinHash` are never serialized to client APIs or included in manager data exports (`GET /api/export`).

---

## 2. Operational & Non-Personal Tenant Data

Every operational table (`Restaurant`, `MenuItem`, `WasteEntry`, `SalesRecord`, `PurchaseRecord`, tenant `EventCalendar`, `ForecastResult`, `Alert`, `Subscription`, `ImportColumnMapping`, `ImportBatch`) is scoped by `tenantId` (`Restaurant.id`) and isolated at runtime via `getTenantDb` / `createTenantDb`. Platform-wide seasonal records in `EventCalendar` (`tenantId = null`) contain public holiday/event dates and demand multipliers with no personal data.

---

## 3. Purpose & Legal Basis (Engineering Scope)

Operational and limited staff/manager data are processed solely to deliver core platform functionality requested by the subscribing hospitality business:
1. Authenticating managers/owners (email + password) and kitchen staff (branch code + username + PIN).
2. Attributing waste entries (`WasteEntry.loggedById`) by shift and user within the restaurant branch.
3. Computing forecasts, prep recommendations, alerts, and monthly SAR savings estimates.
4. Delivering requested operational emails (welcome credentials, critical alerts, weekly summaries, monthly reports) to opted-in managers/owners.
5. Maintaining multi-tenant security and compliance audit logs (`AuditLog`).

Final PDPL lawful basis wording, Data Controller/Processor designations, and DPO contact details are reserved for legal review on `/privacy` and `/terms`.

---

## 4. Retention Policy

- **Active Tenant Data:** Operational records and staff/manager accounts are retained while the restaurant's tenant account remains active (including when temporarily suspended so billing or operational recovery can restore access).
- **Soft-Deleted Waste Undo Records (`WasteEntry.deletedAt`):** Entries undone within the kitchen undo window are marked with `deletedAt` and excluded from operational analytics, then removed permanently upon tenant deletion.
- **Account Deactivation:** Staff or manager accounts can be marked `active = false` to preserve historical waste attribution integrity without allowing authentication.
- **Full Tenant Deletion:** When executed by a `PLATFORM_ADMIN`, all tenant operational rows, users, notification preferences, import batches, and tenant `AuditLog` rows are deleted inside a single database transaction. One non-PII platform `AuditLog` record (`ADMIN_RESTAURANT_DELETED`, `tenantId: null`) containing only the restaurant `code`, `entityId`, and aggregate deleted row counts is retained for compliance accountability.
- **Raw Import Files:** Discarded immediately after in-memory parse/confirm request completion.

---

## 5. Hosting, Storage & Third-Party Subprocessors

| Component | Technology | Notes for PDPL Deployment |
| --- | --- | --- |
| **Application Runtime & Scheduled Jobs** | Next.js App Router (Node.js runtime; `vercel.json` cron schedules) | Set production deployment region in Saudi Arabia or an approved jurisdiction matching your PDPL cross-border transfer assessment. |
| **Primary Database** | PostgreSQL (`DATABASE_URL`) via Prisma | Configure TLS (`sslmode=require`) and host inside KSA or a PDPL-compliant region. |
| **Transactional Email** | Resend (`RESEND_API_KEY`, optional) | Receives only recipient `email`, name, locale, and notification template content when enabled; falls back to stdout dev logging if unset. |
| **Analytics / Ad Trackers** | **None** | No Google Analytics, Meta Pixel, PostHog, Sentry, or third-party tracking scripts are loaded. |

---

## 6. Cookie Notice

Wafrah sets **only strictly essential first-party cookies**:

| Cookie Name | Purpose | Security Flags |
| --- | --- | --- |
| `authjs.session-token` (`__Secure-authjs.session-token` on HTTPS prod) | Encrypted Auth.js JWT session token (`A256CBC-HS512`) | `httpOnly`, `sameSite=lax`, `secure` in non-localhost production; 12h fixed TTL (`STAFF`), 7d sliding TTL (`MANAGER`/`OWNER`/`PLATFORM_ADMIN`) |
| `authjs.csrf-token` (`__Host-authjs.csrf-token` on HTTPS prod) | Auth.js double-submit CSRF protection token | `httpOnly`, `sameSite=lax`, `secure` in non-localhost production |
| `authjs.callback-url` (`__Secure-authjs.callback-url` on HTTPS prod) | Auth.js post-login/logout redirect state | `httpOnly`, `sameSite=lax`, `secure` in non-localhost production |
| `NEXT_LOCALE` | Selected interface language (`ar` or `en`) | `httpOnly`, `sameSite=lax`, `secure` in non-localhost production, 1-year `maxAge` |

Because **no non-essential, marketing, or analytics cookies** exist, no tracking consent banner is triggered. Disclosing these essential cookies remains recommended when legal counsel updates the `/privacy` policy.

---

## 7. Data Subject / Restaurant Portability & Deletion Procedures

### 7.1 Manager Data Export (ZIP of CSVs)
1. Sign in as a `MANAGER` or `OWNER`.
2. Navigate to **Settings** (`/settings/notifications`) and click **Export Restaurant Data (ZIP)**, or call `GET /api/export`.
3. Wafrah queries all 14 tenant-scoped tables via `getTenantDb(user)` (filtering `EventCalendar` to tenant-owned rows only and omitting `passwordHash`/`pinHash`), encodes formula-safe UTF-8 CSV spreadsheets (`src/lib/csv.ts`), packages them into a PKZIP archive (`src/lib/zip.ts`), logs `TENANT_DATA_EXPORTED`, and returns `wafrah-export-<code>-<YYYY-MM-DD>.zip` with `Cache-Control: no-store`.

### 7.2 Admin-Only Tenant Data Deletion
1. Sign in as `PLATFORM_ADMIN` and open `/admin`.
2. Click **Delete** on the target restaurant row in the customers table.
3. Type the restaurant's exact English or Arabic name (`confirmName`) in the confirmation modal and submit (`DELETE /api/admin/restaurants/[id]/delete`).
4. Server-side validation checks `PLATFORM_ADMIN` role, rate limit, Zod `restaurantIdSchema` & `deleteRestaurantSchema`, and exact `name`/`nameAr` match before deleting `WasteEntry`, tenant `AuditLog` rows, and the `Restaurant` record (cascading all remaining child tables) inside a database transaction, leaving only a non-PII `ADMIN_RESTAURANT_DELETED` audit log.

---

## 8. Pilot Sign-Up Leads (`Lead` Model)

### 8.1 Data Stored & Minimization
- **Table:** `Lead` (`prisma/schema.prisma`, non-tenant platform table).
- **Fields stored:** Applicant name (`name`), business name (`businessName`), role (`role`), city (`city`, `cityOther` when `OTHER`), Saudi mobile/WhatsApp number normalized to `+9665XXXXXXXX` (`phone`), optional email (`email`), branch count (`branches`), current POS type (`posSystem`), form locale (`locale`), explicit opt-in flag & timestamp (`consent`, `consentAt`), optional campaign attribution parameters (`utmSource`, `utmMedium`, `utmCampaign`), pipeline status (`status`: `NEW | CONTACTED | PILOT | NOT_FIT`), internal follow-up notes (`notes`), and creation timestamp (`createdAt`).
- **What is NOT stored:** Client IP addresses, user-agent strings, cookies, or tracking fingerprints are **not** stored on `Lead` records (IP addresses are used only ephemerally in server memory for per-hour sliding-window rate limiting).

### 8.2 Purpose, Legal Basis & Access Control
- **Purpose:** Reviewing pilot applications, contacting applicants within one business day via WhatsApp/phone/email, and recording onboarding eligibility during the Makkah & Jeddah founding pilot.
- **Legal basis:** Explicit applicant consent recorded at submission (`consent = true`, `consentAt`) via the public pilot request form (`#pilot-form` -> `POST /api/leads`) linking to `/privacy`.
- **Access restriction:** `Lead` is classified as a platform-only table (`PLATFORM_ONLY_MODELS`). `createTenantDb` / `getTenantDb` explicitly forbid every query or mutation on `Lead` (`TenantIsolationError`), `GET /api/leads` returns `405`, and `/api/admin/leads*` enforces `PLATFORM_ADMIN` role authorization (`requireRole("admin.*")`). Status transitions are logged via `AuditLog` (`ADMIN_LEAD_STATUS_UPDATED`, `tenantId: null`) without duplicating lead PII.

### 8.3 Retention Policy
- **`Lead` records:** `[PLACEHOLDER: confirm retention window with owner — e.g., delete or anonymize unconverted leads X months after pilot cohort close]`.

