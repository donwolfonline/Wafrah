# Wafrah Quality Assurance Report (`QA.md`)

**Date:** 2026-11-14
**Target URL (production build verification):** `http://localhost:3105` (`pnpm build` + `next start -p 3105`)
**Scope:** Full quality verification against `AGENTS.md` and `SPEC.md` with zero feature additions.

---

## 1. Executive Summary & `SPEC.md` Target Verdicts

| Target / Requirement | Measured Result | Verdict |
|---|---|---|
| TypeScript (`pnpm typecheck`) | `tsc --noEmit` exited `0` (0 errors) | **PASS** |
| ESLint (`pnpm lint`) | `eslint .` exited `0` (0 errors/warnings) | **PASS** |
| Unit & Integration Suite (`pnpm test`) | 32 files / 119 tests passed, 0 failed, 0 skipped | **PASS** |
| Domain Pure-Logic Coverage (`insights`, `forecast`, `reports`) | `93.94%` (`insights`), `97.44%` (`forecast`), `99.42%` (`reports`); `97.27%` combined stmts | **PASS (>= 90%)** |
| Playwright E2E Suite (Desktop + Mobile, AR + EN) | 29 / 29 tests passed | **PASS** |
| Waste Log Taps (`<= 4` taps) | 4 taps (`item -> +1 -> reason -> save`) | **PASS** |
| Local Waste Save Latency (`< 1,000 ms`) | `67 ms` (AR Desktop), `62 ms` (EN Desktop), `69 ms` (AR Mobile), `61 ms` (EN Mobile) | **PASS** |
| Manager Dashboard Load (`< 2,000 ms`) | Server: `10–21 ms`; Client navigation to interactive dashboard: `359–378 ms` | **PASS (local DB; see Known Gaps)** |
| WCAG 2A / 2AA (`@axe-core/playwright`, AR & EN) | 0 serious/critical violations on `/login`, `/log`, `/dashboard`, `/reports`, `/reports/2026-08` after contrast fixes | **PASS** |
| Mobile Lighthouse (`/log` & `/dashboard`, AR) | `/log`: Perf `99` / A11y `100` / BP `100` / SEO `100`; `/dashboard`: Perf `93` / A11y `100` / BP `100` / SEO `100` | **PASS** |

---

## 2. Static Checks & Full Test Suite Matrix

| Check | Command | Scope | Result |
|---|---|---|---|
| Typecheck | `pnpm typecheck` | Strict TypeScript across `src/`, `e2e/`, `prisma/` | Exit `0` |
| Lint | `pnpm lint` | ESLint across project | Exit `0` |
| Unit & DB Integration | `pnpm test` | 32 Vitest test files against seeded local PostgreSQL (`localhost:5432`) | **32 files / 119 tests passed** |
| Production Build | `pnpm build` | Next.js `16.4.6` webpack production build (`30/30` static/route trace completion) | Exit `0` |

### Domain Module Coverage (`vitest --coverage` v8 provider)

Run command:
`pnpm exec vitest run --coverage --coverage.include='src/features/insights/**/*.ts' --coverage.include='src/features/forecast/**/*.ts' --coverage.include='src/features/reports/**/*.ts' src/features/insights src/features/forecast src/features/reports`
Result: **10 test files / 33 tests passed**, `97.27%` Statements, `84.39%` Branches, `98.59%` Functions, `97.27%` Lines.

*(Note: TypeScript-only `types.ts` files carry `0` executable statements.)*

| Module / File | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| **`src/features/forecast` (Subtotal)** | **97.44%** | **83.92%** | **100%** | **97.44%** |
| `forecast/accuracy.ts` | 97.02% | 93.33% | 100% | 97.02% |
| `forecast/math.ts` | 96.87% | 93.33% | 100% | 96.87% |
| `forecast/model-helpers.ts` | 94.69% | 75.86% | 100% | 94.69% |
| `forecast/service.ts` | 99.19% | 77.77% | 100% | 99.19% |
| `forecast/statistical-forecaster.ts` | 99.01% | 83.87% | 100% | 99.01% |
| `forecast/index.ts` | 100% | 100% | 100% | 100% |
| **`src/features/insights` (Subtotal)** | **93.94%** | **84.12%** | **95.65%** | **93.94%** |
| `insights/aggregators.ts` | 95.51% | 82.19% | 100% | 95.51% |
| `insights/math.ts` | 100% | 89.47% | 100% | 100% |
| `insights/service.ts` | 92.51% | 66.66% | 75% | 92.51% |
| `insights/spike-detector.ts` | 90.95% | 88.13% | 100% | 90.95% |
| `insights/index.ts` | 100% | 100% | 100% | 100% |
| **`src/features/reports` (Subtotal)** | **99.42%** | **85.02%** | **100%** | **99.42%** |
| `reports/action-rules.ts` | 100% | 90.62% | 100% | 100% |
| `reports/action-text.ts` | 100% | 68.42% | 100% | 100% |
| `reports/baseline-context.ts` | 97.22% | 14.28% | 100% | 97.22% |
| `reports/daily-queries.ts` | 100% | 100% | 100% | 100% |
| `reports/queries.ts` | 100% | 100% | 100% | 100% |
| `reports/report-builder.ts` | 98.89% | 88.88% | 100% | 98.89% |
| `reports/savings.ts` | 98.99% | 91.11% | 100% | 98.99% |
| `reports/service.ts` | 100% | 73.07% | 100% | 100% |
| `reports/validation.ts` | 100% | 100% | 100% | 100% |
| `reports/index.ts` | 100% | 100% | 100% | 100% |

Added unit test coverage files:
- `src/features/insights/spike-edges.test.ts`
- `src/features/reports/report-builder.test.ts`
- Expanded `src/features/forecast/forecast-math.test.ts` and `src/features/reports/action-rules.test.ts`

---

## 3. Playwright End-to-End Suites

Command: `APP_URL=http://localhost:3105 pnpm exec playwright test --reporter=list`
Result: **29 passed (29 total)** across Desktop (`chromium`, `1280x800`) and Mobile (`mobile`, `375x812`).

| Suite | Viewports | Locales | What Was Verified | Result |
|---|---|---|---|---|
| Staff Journey (`e2e/qa-journeys.spec.ts`) | Desktop + Mobile | AR, EN | PIN login (`SHAMI-JED` / `ahmed` / `1234`) -> 4-tap log -> `<1s` local IndexedDB save (`61–69ms`) -> 10s Undo removal -> offline log -> reconnect single sync -> DB cleanup | **4 / 4 PASS** |
| Manager Journey (`e2e/qa-journeys.spec.ts`) | Desktop + Mobile | AR, EN | Manager login -> add menu item on `/menu` -> upload matching sales CSV on `/imports` -> `/dashboard` load (`server 10–21ms`, `client 359–378ms`) -> open `/reports/2026-08` -> DB cleanup | **4 / 4 PASS** |
| Admin Journey (`e2e/qa-admin-isolation.spec.ts`) | Desktop + Mobile | AR, EN | Platform Admin login -> create restaurant -> suspend tenant -> block login -> reactivate tenant -> restore login -> DB cleanup | **4 / 4 PASS** |
| Multi-Tenant Isolation (`e2e/qa-admin-isolation.spec.ts`) | Desktop + Mobile | AR, EN | `SHAMI-JED` vs `DIWAN-MKH` never expose each other's items/metrics across UI pages or API endpoints | **4 / 4 PASS** |
| Empty & Error States (`e2e/qa-empty-error-rtl.spec.ts`) | Desktop | AR, EN | Brand-new empty restaurant across `/dashboard`, `/menu`, `/reports`, `/log`; malformed CSV header & >50% invalid CSV rows on `/imports`; sync network failure + retry on `/log`; expired session cookie redirect (`/login?reason=expired`); `401` during sync preserves queue + shows sign-in banner; zero stack traces | **2 / 2 PASS** |
| Accessibility & Keyboard (`e2e/qa-accessibility.spec.ts`) | Desktop | AR, EN | `@axe-core/playwright` (`wcag2a`, `wcag2aa`) + keyboard focus & visible focus ring checks on `/login`, `/log`, `/dashboard`, `/reports`, `/reports/2026-08` | **4 / 4 PASS** |
| Arabic RTL Layout Capture (`e2e/qa-empty-error-rtl.spec.ts`) | 375px + 1280px | AR | `dir="rtl"`, zero horizontal document overflow (`scrollWidth <= clientWidth`), visual inspection across all 11 routes | **1 / 1 PASS** |
| Pre-Existing Feature Specs (`admin`, `dashboard`, `imports`, `notifications`, `reports`, `waste-log`) | Desktop | AR/EN | Core regression specs including `admin.spec.ts` reactivation assertion | **6 / 6 PASS** |

---

## 4. Accessibility & Color Contrast Audit

### Bugs Found & Fixed
1. **Inactive Tab Contrast (`4.33:1` -> `6.51:1`):** `TabsTrigger` in `src/components/ui/tabs.tsx` used `text-foreground/60` on `bg-muted` (`#e3efec`), failing WCAG AA `4.5:1` on `/login` tabs. Fixed to `text-muted-foreground` (`#3b5952` on `#e3efec` = `6.51:1`).
2. **Chart Tooltip Contrast (`2.41:1` -> `17.40:1` / `9.47:1`):** Recharts `<Tooltip>` in `src/features/dashboard/waste-charts.tsx` inherited the gold series color (`#c9a227`) on `#ffffff`. Added explicit `itemStyle={{ color: "#1a1a1a" }}` (`17.40:1`) and `labelStyle={{ color: "#0b4f45", fontWeight: 600 }}` (`9.47:1`).

### Light-Mode Brand Palette Verification (`src/app/globals.css`)
- Primary text on background (`#1a1a1a` on `#f2f8f6`): **16.19:1** (WCAG AAA)
- Primary text on card (`#1a1a1a` on `#ffffff`): **17.40:1** (WCAG AAA)
- Primary button (`#ffffff` on `#0b4f45`): **9.47:1** (WCAG AAA)
- Secondary surface (`#ffffff` on `#0e6b5c`): **6.41:1** (WCAG AA)
- Gold accent badge (`#1a1a1a` on `#c9a227`): **7.19:1** (WCAG AA)
- Gold on dark teal (`#c9a227` on `#0b4f45`): **3.91:1** (used strictly for large UI icons/accents, >= 3.0:1 graphical/large-object threshold; never small body text)
- Muted text (`#3b5952` on `#e3efec` = **6.51:1**; `#3b5952` on `#ffffff` = **7.67:1**)
- Destructive text on card (`#c62828` on `#ffffff`): **5.62:1** (WCAG AA)

---

## 5. Arabic RTL Visual Review (`375px` & `1280px`)

Screenshots inspected visually in Arabic (`dir="rtl"`) at `375x812` and `1280x800` across `/login`, `/privacy`, `/terms`, `/dashboard`, `/log`, `/menu`, `/imports`, `/reports`, `/reports/2026-08`, `/settings/notifications`, and `/admin`.

### Bugs Found & Fixed
1. **375px Kitchen Header Clipping on `/log`:** With `touchTarget={true}`, `LanguageSwitcher` + `UserMenu` exceeded `375px` alongside the brand mark and clipped the end edge of the Sign Out button. Updated `src/components/shell/app-header.tsx` (`flex-wrap`, compact mobile spacing), `src/components/shell/language-switcher.tsx`, and `src/components/shell/user-menu.tsx` to wrap cleanly while preserving `min-h-12` (`48px`) kitchen touch targets.
2. **Mobile Bottom Nav Label Truncation:** In `src/components/shell/manager-nav.tsx`, `truncate` cropped `قائمة الأص...` and `استيراد البي...` at `375px`. Replaced with `text-[11px] leading-tight text-center wrap-break-word` so all 5 Arabic tab labels display in full without ellipses.
3. **KPI RTL Bidi Minus Sign Ordering:** Isolated percentage/delta strings in `src/features/dashboard/kpi-grid.tsx` with `<bdi dir="ltr">` and Unicode LRI/PDI isolates so negative signs stay attached to numeric magnitudes in RTL prose.

### E2E Network Mock Reliability Fix
- Updated `e2e/qa-empty-error-rtl.spec.ts` to configure `serviceWorkers: "block"` on the staff browser context when testing `page.route` aborts/401s (preventing `/sw.js` client claim races), wait for `networkidle` before arming route mocks, and run `SHAMI-JED` test-entry cleanup in `finally`.

---

## 6. Empty & Error States Verified (AR & EN)

- **New empty restaurant:** Added restaurant with zero waste/menu/sales records renders `dashboard-onboarding-checklist` on `/dashboard` and friendly localized empty states on `/menu`, `/reports`, `/log`.
- **Invalid CSV & >50% invalid rows:** Added `data-testid="import-error-alert"` and localized `sales.errors.*` messages in `src/features/sales/import-manager.tsx`, preventing raw English API strings in Arabic UI.
- **Sync failure & 401 expiry during waste logging:** Updated `src/features/waste/offline-queue.ts`, `waste-logger.tsx`, and `waste-header-bar.tsx` with localized `waste-sync-error` + manual retry button (`waste-sync-retry`), and `waste-auth-expired` banner that preserves unsynced IndexedDB entries on `401`.
- **Expired session cookie & runtime boundary:** Updated `src/middleware.ts` and `src/features/auth/login-form.tsx` to clear invalid tokens and show localized `login-expired-notice` at `/login?reason=expired`; added localized `src/app/error.tsx` without exposing stack traces.

---

## 7. Mobile Lighthouse Audits (`--form-factor=mobile`, Arabic)

Audited authenticated production routes on `http://localhost:3105` via `pnpm dlx lighthouse`:

| Route | Auth Role | Performance | Accessibility | Best Practices | SEO | Core Web Vitals & Key Timings |
|---|---|---|---|---|---|---|
| `/log` | Staff PIN (`ahmed`) | **99** | **100** | **100** | **100** | FCP `0.8 s`, LCP `0.8 s`, TBT `110 ms`, CLS `0`, Speed Index `1.2 s`, TTI `3.9 s` |
| `/dashboard` | Manager (`manager@shami.sa`) | **93** | **100** | **100** | **100** | FCP `1.7 s`, LCP `1.7 s`, TBT `270 ms`, CLS `0`, Speed Index `1.8 s`, TTI `5.7 s` |

Diagnostics noted on `/dashboard` (non-blocking, Perf already `93` / A11y `100`):
- **Unused JS (`unused-javascript`):** Recharts client chunk contributes ~`56 KiB` unused JS estimate (`totalBytes: 124,919`). Left static rather than `ssr: false` lazy-loading to avoid layout shift (`CLS = 0`) and delayed chart paint.
- **Render-blocking CSS (`render-blocking-insight`):** `140 ms` from standard Next.js bundled stylesheet (`globals.css`).

---

## 8. Known Gaps & Honest Caveats

1. **Local Environment Timing Caveat:** Sub-2s dashboard timings (`359–378 ms` client, `10–21 ms` server) were measured on local macOS hardware against local PostgreSQL; real-world mobile TTFB on a cloud deployment + higher multi-year tenant data volumes should be benchmarked separately against production latency SLAs.
2. **Heatmap `aria-label` Precision Diagnostic:** Lighthouse flagged informational `label-content-name-mismatch` on dashboard heatmap cells because visible text shows rounded SAR (`601 ر.س`) while `aria-label` reads full two-decimal SAR and record count (`الأحد، الصباحية: 601.45 ر.س، 13 سجل`). Kept intentionally for concise card layout alongside complete screen-reader context.
3. **Mobile Table Horizontal Scrolling (`375px`):** Dense data tables (`/menu` and `/admin`) fit the `375px` viewport with zero page-level overflow (`scrollWidth <= clientWidth`), using container-level `overflow-x-auto` to scroll wide multi-column tables rather than stacked mobile cards.
4. **File Size Soft Limit (`AGENTS.md` ~300 lines):** Four client/module files slightly exceed ~300 lines after security/error-state additions (`src/features/waste/waste-logger.tsx`: 325 lines, `src/features/waste/offline-queue.ts`: 316 lines, `src/features/auth/login-form.tsx`: 309 lines, `src/features/sales/import-manager.tsx`: 304 lines) and are candidates for helper extraction in a follow-up refactor.
5. **Security/DevOps Informational Lighthouse Checks:** On unauthenticated `/login`, Lighthouse informational audits noted missing `/robots.txt` / AI crawler metadata (`llms.txt` / `ard-schema`), which were outside this QA scope (`no new features`).
