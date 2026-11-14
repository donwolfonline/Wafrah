# Wafrah Staging Architecture & Branch Workflow

How Wafrah separates **Staging (Vercel Preview)** from **Production**, manages environment variables safely in Vercel, enforces CI checks via GitHub branch protection, and runs Playwright E2E against Preview URLs.

> [!CAUTION]
> **Strict Isolation Rules:**
> - **Preview / Staging** must use its own separate Staging PostgreSQL database (never Production).
> - **Demo seed (`pnpm db:seed`)** may run **ONLY** locally or on Staging — never on Production (`prisma/seed.ts` fails if `NODE_ENV=production` or `VERCEL_ENV=production`).
> - **Preview deployments must NEVER receive `CRON_SECRET` or the production `RESEND_API_KEY`.** Preview uses console email logging by omitting `RESEND_API_KEY` (or a Resend test key), and leaves cron routes closed (`500`).

---

## 1. Environments at a Glance

| Aspect | Local Development | Staging (`Vercel Preview`) | Production (`main` branch) |
| :--- | :--- | :--- | :--- |
| **Git trigger** | Local checkout | Pull Requests & non-`main` branches | Pushes / PR merges into `main` |
| **PostgreSQL DB** | Local Postgres (`localhost:5432`) | Dedicated **Staging DB** (separate Neon branch/project) | Dedicated **Production DB** (`DATABASE_URL` pooled) |
| **Demo seed (`pnpm db:seed`)** | Allowed | **Allowed (ONLY hosted target)** — zero real customer PII | **Forbidden** — admin-only `pnpm db:seed:prod` |
| **`CRON_SECRET`** | Optional local dev | **Never set (Omit)** — `/api/cron/*` returns `500` | **Required** (`openssl rand -hex 32`) |
| **`RESEND_API_KEY`** | Omit (console preview) | **Omit (console email)** or Resend test key | **Required** (live Resend production key) |
| **Search indexing** | Blocked (`noindex`) | Blocked (`X-Robots-Tag: noindex, nofollow` + `Disallow: /`) | Landing indexable; app/API routes `noindex` |

---

## 2. Provisioning & Seeding the Staging Database

1. Create a separate managed PostgreSQL database (e.g., Neon `staging` branch or separate Supabase staging project) containing **zero production data or real customer PII**.
2. Copy its **pooled** connection URI (for Vercel `DATABASE_URL`) and its **direct** connection URI (for migrations/seeding only).
3. Run schema migrations and the demo seed deliberately from your operator shell **targeting the Staging DB**:

```bash
# Double-check both URLs point to STAGING, never Production!
export DATABASE_URL="postgresql://...STAGING-POOLER...?sslmode=require"
export DIRECT_URL="postgresql://...STAGING-DIRECT...?sslmode=require"
export VERCEL_ENV=preview

# 1. Apply migrations
pnpm db:migrate:deploy

# 2. Seed demo restaurants (SHAMI-JED, DIWAN-MKH) — allowed ONLY locally or on Staging
pnpm db:seed

# Clear staging DB credentials from shell history
unset DATABASE_URL DIRECT_URL VERCEL_ENV
```

> [!NOTE]
> Make sure `NODE_ENV` is **not** set to `"production"` when running `pnpm db:seed` against Staging — `prisma/seed.ts` blocks execution whenever `NODE_ENV === "production"` or `VERCEL_ENV === "production"` as a production safety guard.

---

## 3. Scoping Variables in Vercel (Exact UI Steps)

Open **Vercel Dashboard -> Select `wafrah` Project -> Settings -> Environment Variables**.
For **each** row below, click **Add New**, fill in **Key** and **Value**, and check **ONLY** the specified boxes under **Environments** (**never** select "All Environments" blindly):

| Key | Action in Vercel UI | Exact Environment Checkboxes | Value / Guidance |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Add **two** entries | 1) `[x] Production` only<br>2) `[x] Preview` only | Prod = Production pooled DB URL<br>Preview = Staging pooled DB URL |
| `AUTH_SECRET` | Add **two** distinct entries | 1) `[x] Production` only<br>2) `[x] Preview` only | Generate two separate secrets with `openssl rand -base64 32` |
| `RESEND_API_KEY` | Add for Production; **omit or test key** for Preview | 1) `[x] Production` only *(live key)*<br>2) **Uncheck Preview** *(console email)* **OR** separate Preview entry `[x] Preview` *(test key)* | Preview logs redacted email previews cleanly via `src/lib/email.ts` (`[WAFRAH DEV EMAIL]`) when omitted |
| `CRON_SECRET` | Add **once** for Production | `[x] Production` **ONLY** *(leave Preview unchecked)* | Generate via `openssl rand -hex 32`. Preview never receives `CRON_SECRET`. |
| `APP_URL` | Add for Production | `[x] Production` **ONLY** *(omit on Preview)* | `https://wafrah.sa` (Preview automatically uses `VERCEL_URL`) |
| `NEXT_PUBLIC_SITE_URL` | Add for Production | `[x] Production` **ONLY** *(omit on Preview)* | `https://wafrah.sa` (omit on Preview so canonical/redirect rules never hijack `*.vercel.app`) |
| `FOUNDER_EMAIL` | Add **two** entries | 1) `[x] Production` only<br>2) `[x] Preview` only | Prod = live founder inbox<br>Preview = engineering test inbox |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Add one or two entries | `[x] Production` + optionally `[x] Preview` | Digits without `+` (e.g., `9665XXXXXXXX` or test number on Preview) |
| `EMAIL_FROM` | Add for Production | `[x] Production` only *(optional on Preview)* | Verified Resend sender (`Wafrah <notifications@wafrah.sa>`) |
| `AUTH_TRUST_HOST` | Leave omitted (`true` default) | Optional | Never set `AUTH_URL` on Preview |
| `DIRECT_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | **Do NOT store in Vercel** | Unchecked everywhere *(CLI/CI only)* | Keep direct DB URLs and bootstrap admin password out of Vercel runtime |
| `NODE_ENV` | **Never add manually** | Do not create | Vercel manages `NODE_ENV` automatically; setting it manually breaks `pnpm install` devDependencies |

After saving changes to `NEXT_PUBLIC_*` variables, go to **Deployments -> ... -> Redeploy** so the next build picks them up.

---

## 4. Branch Strategy & GitHub Branch Protection

### Branch Workflow

1. **`main`**: Always deployable. Merges to `main` trigger Vercel **Production** deployments (migrations still run deliberately via `pnpm db:migrate:deploy` beforehand per [docs/DB-OPS.md](./DB-OPS.md)).
2. **Feature / Fix branches** (`feat/*`, `fix/*`, `docs/*`): Never commit directly to `main`. Push a branch and open a Pull Request (using [`.github/pull_request_template.md`](../.github/pull_request_template.md)), which runs GitHub Actions **`CI`** and deploys a Vercel **Preview** URL against the Staging database.

### Exact Steps to Enable Branch Protection in GitHub

In your GitHub repository (`donwolfonline/Wafrah`), perform these clicks:

1. Click **Settings** (top repository navigation bar).
2. In the left sidebar under **Code and automation**, click **Branches**.
3. Under **Branch protection rules**, click **Add branch protection rule** (or **Add classic branch protection rule**).
4. Set **Branch name pattern** to `main`.
5. Check **`Require a pull request before merging`** -> optionally check **Require approvals** (`1`) and **Dismiss stale pull request approvals when new commits are pushed**.
6. Check **`Require status checks to pass before merging`**:
   - Check **`Require branches to be up to date before merging`**.
   - In the search box under **Status checks that are required**, search for **`Validate, Test & Build`** (the job name in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) and click to add it. *(Note: GitHub shows a check in search results after `.github/workflows/ci.yml` has run at least once on a push or PR.)*
7. Check **`Do not allow bypassing the above settings`** (enforces rules for administrators so no direct pushes bypass CI).
8. Leave **`Allow force pushes`** and **`Allow deletions`** unchecked.
9. Scroll to the bottom and click **Create** (or **Save changes**).

*(Alternative newer GitHub UI: **Settings -> Rules -> Rulesets -> New ruleset -> New branch ruleset**, Target `Default branch`, enable **Restrict deletions**, **Block force pushes**, **Require a pull request before merging**, **Require status checks to pass** -> add `Validate, Test & Build`, and ensure **Bypass list** is empty.)*

---

## 5. Running Playwright E2E Against a Preview Deployment

[`.github/workflows/e2e-staging.yml`](../.github/workflows/e2e-staging.yml) never runs on every push; trigger it manually against any live Vercel Preview URL:

1. Copy your Vercel Preview deployment URL from the PR comment or Vercel Dashboard (e.g., `https://wafrah-git-feat-my-branch-team.vercel.app`).
2. In GitHub, click **Actions -> Playwright E2E (Staging) -> Run workflow**.
3. Paste the Preview URL into **`base_url`**.
4. Choose **`suite`**:
   - **`browser-smoke`**: Runs browser/UI/accessibility/offline sync specs (`e2e/waste-log.spec.ts`, `e2e/qa-accessibility.spec.ts`, `e2e/landing-qa.spec.ts`) — requires zero database secrets.
   - **`all`**: Runs the full `./e2e` directory — requires **`STAGING_DATABASE_URL`** (and optional **`STAGING_DIRECT_URL`**) saved under **GitHub Settings -> Secrets and variables -> Actions -> Repository secrets** (or a `staging` environment), pointed strictly at the Staging database. *(Note: Preview `robots.txt` is `Disallow: /` and `CRON_SECRET` is unset, so launch-SEO/cron-401 assertions in `landing-launch.spec.ts`/`notifications.spec.ts` target Production-like hosts.)*
5. If **Vercel Deployment Protection** (Standard Protection / Vercel Authentication) blocks unauthenticated requests to Preview URLs in your account, either allow CI previews or disable Vercel Authentication for non-sensitive QA preview branches.
