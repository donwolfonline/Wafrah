# Wafrah (وفرة)

AI-powered food waste management SaaS for restaurants and hospitality kitchens in Saudi Arabia. Built with Next.js (App Router), TypeScript, PostgreSQL + Prisma, Auth.js, Tailwind CSS, `shadcn/ui`, `next-intl` (Arabic RTL default + English LTR), and `Asia/Riyadh` business-day logic.

---

## 1. Run Locally

Prerequisites: Node.js 20+, `pnpm`, and a local or Docker PostgreSQL 16 instance.

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy environment template and configure `.env`:

   ```bash
   cp .env.example .env
   ```

   Minimum local `.env` values:
   - `DATABASE_URL` (PostgreSQL connection string)
   - `AUTH_SECRET` (`openssl rand -base64 32`)
   - `APP_URL="http://localhost:3000"`
   - Optional `/help` support contact vars: `SUPPORT_CONTACT_NAME`, `SUPPORT_CONTACT_EMAIL`, `SUPPORT_CONTACT_PHONE`, `SUPPORT_WHATSAPP_URL`

3. Run migrations and start the development server:

   ```bash
   pnpm db:migrate
   pnpm db:seed
   pnpm dev
   ```

   Open `http://localhost:3000`.

---

## 2. Seed Commands & Demo Credentials

- **Development seed** (demo restaurants, 35 days of sales/waste/purchases, insights, forecasts):

  ```bash
  pnpm db:seed
  ```

- **Full local reset + re-seed**:

  ```bash
  pnpm db:reset
  ```

- **Production bootstrap seed** (creates Platform Admin only; **zero** demo restaurants or operational data):

  ```bash
  ADMIN_BOOTSTRAP_PASSWORD="..." pnpm db:seed:prod
  ```

Development-only demo accounts created by `pnpm db:seed`:

| Role | Restaurant Code | Login Identifier | Password / PIN |
| :--- | :--- | :--- | :--- |
| Platform Admin | — | `admin@wafrah.sa` | `WafrahAdmin!2026` |
| Owner (Jeddah) | `SHAMI-JED` | `manager@shami.sa` | `ShamiManager!2026` |
| Staff (Jeddah) | `SHAMI-JED` | `ahmed` / `omar` | `1234` / `5678` |
| Owner (Makkah) | `DIWAN-MKH` | `manager@diwan-makkah.sa` | `DiwanManager!2026` |
| Staff (Makkah) | `DIWAN-MKH` | `salem` | `4321` |

---

## 3. Running Tests & Quality Gates

Run the full quality gate suite before pushing or deploying:

```bash
pnpm typecheck   # TypeScript strict check
pnpm lint        # ESLint
pnpm test        # Vitest unit + PostgreSQL integration suites
pnpm build       # Production Next.js build (webpack)
```

Regenerate static Open Graph PNG images (`public/og-ar.png` and `public/og-en.png`, `1200x630`, rendered via Playwright Chromium in [`scripts/generate-og-images.ts`](./scripts/generate-og-images.ts) instead of `next/og` for proper Arabic ligature shaping):

```bash
pnpm og:generate
```

End-to-end tests with Playwright (requires the app running or `APP_URL` reachable):

```bash
pnpm exec playwright test
```

---

## 4. Background Jobs & Scheduled Crons

CLI runners (run manually against the configured `DATABASE_URL`):

```bash
pnpm insights:run   # Waste anomaly detection & top-item alerts
pnpm forecast:run   # Daily demand + Newsvendor prep/purchase recommendations
pnpm cron:daily     # Full daily pipeline (insights -> forecast -> email notifications)
```

Scheduled Vercel cron endpoints (defined in [`vercel.json`](./vercel.json), `"regions": ["fra1"]`, Production deployments only, secured via `Authorization: Bearer <CRON_SECRET>`):

- `GET /api/cron/daily` (`0 0 * * *` UTC / `03:00` Asia/Riyadh) — insights, forecasting, alert digest emails
- `GET /api/cron/weekly` (`0 5 * * 0` UTC / `08:00` Asia/Riyadh Sunday) — weekly restaurant summary email
- `GET /api/cron/monthly` (`0 5 1 * *` UTC / `08:00` Asia/Riyadh 1st of month) — monthly executive report email

Manual HTTP trigger example (staging/production):

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/daily
```

---

## 5. Deployment

See [`DEPLOY.md`](./DEPLOY.md) for full production instructions covering:

- Vercel + managed PostgreSQL setup and Saudi PDPL data-residency tradeoffs
- `prisma migrate deploy` release pipeline & `pnpm db:seed:prod`
- Environment variable checklist & `/api/health` verification
- Staging isolation rules & backup/restore drills

Related documentation: [`SECURITY.md`](./SECURITY.md) · [`DATA.md`](./DATA.md) · [`QA.md`](./QA.md)

---

## 6. Pilot Day-1 Checklist

Complete these steps when onboarding a new pilot restaurant:

1. **Environment check:** Confirm `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `CRON_SECRET`, `RESEND_API_KEY`, and `SUPPORT_CONTACT_*` are set in production; verify `/api/health` returns `{ "status": "ok", "version": "...", "time": "..." }` and `/api/health/deep` (`Authorization: Bearer $CRON_SECRET`) checks DB + cron freshness.
2. **Provision restaurant (`/admin`):** Create the restaurant, confirm the generated Branch Code (e.g., `NAJD-RYD`), and securely share the one-time manager password.
3. **Manager first sign-in (`/dashboard`):** Have the manager change/confirm credentials and review the 5-step **Onboarding Checklist**:
   - Step 1 (`/menu`): Add core menu items with canonical units (`KG`, `LITER`, `PORTION`, `PIECE`) and SAR unit costs.
   - Step 2 (`/settings/staff`): Create kitchen staff usernames (receive 4-digit PINs, shown once) and **print the 1-page Quick-Start QR Card**.
   - Step 3 (`/imports`): Import at least 14–30 days of historical sales CSV (matching item codes/names).
4. **Kitchen tablet setup:** Laminate the printed Quick-Start card near the prep station, scan the QR code (`/login?tab=staff&code=<CODE>`), sign in with a test staff PIN, log one sample waste entry, and verify the Undo button + offline badge.
5. **Confirm daily job readiness:** After the first `00:00 UTC` (`03:00 Asia/Riyadh`) daily cron run (or a manual `/api/cron/daily` run), verify Step 5 marks **Insights ready** and the restaurant checklist disappears automatically.
6. **Daily pilot check-in (`/admin`):**
   - Open **Adoption** tab daily to review 14-day entry sparklines and call any restaurant flagged **`No entries in 3d`**.
   - Open **Feedback** tab daily to triage ratings and comments submitted via the floating Feedback button.
