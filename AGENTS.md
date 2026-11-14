# AGENTS.md — Standing Engineering Rules for Wafrah

These rules apply to **every** agent session working on **Wafrah** (an AI-powered food waste management SaaS for restaurants and hotels in Saudi Arabia). Read and follow this file before making any changes.

---

## 1. Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript (`strict: true`)
- **Styling & UI:** Tailwind CSS + `shadcn/ui`
- **Database & ORM:** PostgreSQL + Prisma
- **Authentication:** Auth.js (NextAuth)
- **Internationalization:** `next-intl`
- **Charts & Visualization:** Recharts
- **Unit & Integration Testing:** Vitest
- **End-to-End Testing:** Playwright
- **Package Manager:** `pnpm` (never use `npm` or `yarn`)

---

## 2. Codebase & Architecture Conventions

- **Feature-based structure:** Place domain features under `src/features/<name>` (e.g., `src/features/waste-log`, `src/features/forecasting`, `src/features/imports`).
- **Shared utilities:** Place cross-cutting helpers, database clients, UI primitives, and shared utilities under `src/lib`.
- **Single responsibility:** One responsibility per file.
- **File size limit:** Keep every file under **~300 lines**. Split into smaller modules before exceeding this limit.
- **Exports:** Use **named exports** everywhere (`export function ...`, `export const ...`). Only use default exports where explicitly required by Next.js App Router file conventions (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, etc.).
- **Input validation & CSV rules:**
  - Validate **every** API input (Route Handlers, Server Actions, CSV payloads, query params) with **Zod** schemas at the boundary.
  - **CSV imports:** Accept dates in `YYYY-MM-DD`, `DD/MM/YYYY`, and Excel serial formats. Match items by `MenuItem.code` first, then normalized Arabic/English name (case- and diacritics-insensitive); send unmatched names to a mapping step. Default missing sales `channel` to `UNSPECIFIED`. Support partial imports (after manager preview confirmation) with downloadable rejected rows and reasons; reject the entire file only if required columns are missing or >50% of rows are invalid. Ensure re-imports are idempotent via upsert.

---

## 3. Multi-Tenancy & Security Rule

- **Tenant column:** Every tenant-owned database table **must** include a `tenantId` column.
- **Single tenant-scoping helper:** Every query reading or mutating tenant data **must** go through a single shared tenant-scoping helper. Ad-hoc unscoped Prisma queries on tenant tables are forbidden.
- **Zero client trust:** **Never** trust a `tenantId` sent by the client (body, query string, headers, or URL params). Always resolve `tenantId` server-side from the authenticated session (` Platform Admin` impersonation/management flows must also enforce explicit server-side authorization checks).

---

## 4. Internationalization (i18n) & RTL Rule

- **No hard-coded UI strings:** Every user-facing label, placeholder, toast, error message, report header, and chart label must go through `next-intl`.
- **Locales:** **Arabic (`ar`) is the default locale** (RTL); **English (`en`)** is the secondary locale (LTR).
- **Logical CSS properties only:** Always use Tailwind logical layout utilities so both RTL and LTR render properly:
  - Margin: `ms-*`, `me-*` (never `ml-*`, `mr-*`)
  - Padding: `ps-*`, `pe-*` (never `pl-*`, `pr-*`)
  - Positioning: `start-*`, `end-*` (never `left-*`, `right-*`)
  - Text alignment: `text-start`, `text-end` (never `text-left`, `text-right`)
  - Borders & rounding: `border-s-*`, `border-e-*`, `rounded-s-*`, `rounded-e-*`

---

## 5. Money, Units, Dates, Shifts & Timezone

- **Currency:** Saudi Riyal (`SAR`).
- **Numeric precision:** Use `Decimal` types (Prisma `Decimal` / `decimal.js`) for all money amounts, item quantities, and conversion factors. **Never use IEEE-754 floats (`number`) for money calculations.**
- **Supported units:** Only `KG`, `LITER`, `PORTION`, and `PIECE` are permitted (decimal quantities allowed, e.g., `0.25` `KG`; never use `g` or `mL`). Use `MenuItem.salesUnitFactor` (`Decimal`, default `1`) to convert sold quantities into the item's canonical unit.
- **Storage & display timezone:**
  - Store all timestamps in **UTC** in PostgreSQL.
  - Convert to and evaluate business days, shifts, and reports in **`Asia/Riyadh`** (UTC+3).
  - Derive Hijri calendar dates using `Intl` with the `islamic-umalqura` calendar.
- **Shift rules:**
  - Three shifts (`MORNING`, `EVENING`, `NIGHT`) evaluated in `Asia/Riyadh`.
  - Default start boundaries: `MORNING` `05:00–14:59`, `EVENING` `15:00–22:59`, `NIGHT` `23:00–04:59`.
  - Resolve active shift from `Restaurant.shiftConfig` (JSON storing the three shift start times, editable by the manager to adapt for Ramadan or custom hours), while allowing kitchen staff to override the auto-detected shift on the waste log screen.

---

## 6. Quality Gates

- **After every task:** Run all three checks and report their exact results:
  1. `pnpm typecheck`
  2. `pnpm lint`
  3. `pnpm test`
- **Mandatory unit tests:** Write unit tests (Vitest) for **all pure domain logic**, specifically including:
  - Waste pattern / anomaly detection
  - Daily demand forecasting
  - Newsvendor purchase/prep recommendations
  - Monthly SAR savings calculations

---

## 7. Scope Guard & Secrets Hygiene

- **No unrequested scope:** Do not add features, dependencies, or architectural abstractions that were not explicitly requested.
- **Dependency gate:** **Ask the user for approval before adding any new package dependency** to `package.json`.
- **Secrets management:** Never hard-code secrets, API keys, or connection strings in source code or tests. Read configuration from `.env` and keep `.env.example` updated whenever a new environment variable is introduced.

---

## 8. Working Style

- At the end of each task, provide a concise summary covering:
  1. **What changed** (files created or modified and why).
  2. **Quality gate results** (`typecheck`, `lint`, `test`).
  3. **How to verify manually** (clear step-by-step instructions to test the behavior in the UI or via CLI).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
