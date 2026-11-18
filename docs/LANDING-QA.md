# Wafrah Landing Page — Launch Readiness QA Report

Audit and remediation report for Wafrah's public marketing pages (`/` Arabic RTL default, `/en` English LTR) ahead of pilot sign-up collection in Riyadh.

---

## 1. Benchmark Methodology

All performance, transfer, accessibility, and SEO checks were captured against an optimized production webpack build (`pnpm build` -> `next start`) at a `375x812` mobile viewport:

- **Google Lighthouse (`13.6.0`, Mobile emulation, headless Chromium):** Official scores for Performance, Accessibility, Best Practices, and SEO plus Core Web Vitals (`FCP`, `LCP`, `CLS`, `TBT`, Speed Index) and failing/opportunity audits.
- **Playwright Chromium CDP Trace (4x CPU throttling, mobile `375x812`):** Exact HTML byte count, transfer KB broken down by resource type, font count, DOM metadata (`title`, `description`, `canonical`, `hreflang`, `og:*`, `twitter:*`, JSON-LD scripts), HTTP status/headers (`X-Robots-Tag`, redirects), and `@axe-core/playwright` WCAG `2.0/2.1 A/AA` scan across full-page scroll.

---

## 2. Before / After Measurements (Mobile `375x812`)

### Arabic Default Landing (`/`)

| Metric / Check | Baseline (Before) | Post-Fix (After) | Target | Status |
| --- | --- | --- | --- | --- |
| Lighthouse Performance | `100` | `99` | `>= 90` | Pass |
| Lighthouse Accessibility | `100` | `100` | `>= 95` | Pass |
| Lighthouse Best Practices | `100` | `100` | `>= 95` | Pass |
| Lighthouse SEO | `92` | `100` | `>= 95` | Pass |
| Lighthouse FCP / LCP | `1.0 s` / `1.0 s` | `1.0 s` / `1.0 s` | `< 2.5 s` | Pass |
| Lighthouse Speed Index | `1.7 s` | `1.0 s` | — | Improved |
| Lighthouse CLS | `0` | `0` (`0.00026`) | `< 0.05` | Pass |
| Lighthouse TBT | `90 ms` (`87 ms`) | `100 ms` (`105 ms`) | — | Pass |
| CDP FCP / LCP (4x CPU) | `336 ms` / `336 ms` | `220 ms` / `220 ms` | `< 2.5 s` | Improved |
| SSR HTML Payload | `258,111 B` (`64.4 KB` transfer) | `188,443 B` (`45.9 KB` transfer) | Reduce payload | `-27.0%` HTML bytes |
| `robots.txt` audit | Fail (`307` -> `/login`) | Pass (`200 text/plain`) | Pass | Fixed |
| `bf-cache` audit | Fail (`no-store`) | Pass | Pass | Fixed |
| `og:image` (`1200x630` PNG) | Missing (`null`) | `/og-ar.png` (`200 image/png`) | Present & valid | Fixed |
| `twitter:card` | `summary` | `summary_large_image` | `summary_large_image` | Fixed |
| JSON-LD Schemas | `0` | `Organization`, `SoftwareApplication`, `FAQPage` | All 3 (no fake ratings) | Fixed |
| Axe WCAG A/AA violations | `0` | `0` | `0` | Pass |

### English Secondary Landing (`/en`)

| Metric / Check | Baseline (Before) | Post-Fix (After) | Target | Status |
| --- | --- | --- | --- | --- |
| Lighthouse Performance | `100` | `100` | `>= 90` | Pass |
| Lighthouse Accessibility | `100` | `100` | `>= 95` | Pass |
| Lighthouse Best Practices | `100` | `100` | `>= 95` | Pass |
| Lighthouse SEO | `92` | `100` | `>= 95` | Pass |
| Lighthouse FCP / LCP | `1.0 s` (`958 ms`) / `1.0 s` (`958 ms`) | `0.8 s` (`812 ms`) / `0.8 s` (`812 ms`) | `< 2.5 s` | Improved |
| Lighthouse Speed Index | `1.0 s` | `0.8 s` | — | Improved |
| Lighthouse CLS | `0` | `0` (`0`) | `< 0.05` | Pass |
| Lighthouse TBT | `60 ms` (`58 ms`) | `50 ms` (`52 ms`) | — | Improved |
| SSR HTML Payload | `225,234 B` (`58.7 KB` transfer) | `175,808 B` (`42.4 KB` transfer) | Reduce payload | `-21.9%` HTML bytes |
| Font Transfer | `246.5 KB` | `186.8 KB` | Minimize fonts | `-24.2%` |
| Total Network Transfer | `603.4 KB` (`34` reqs) | `533.2 KB` (`31` reqs) | Reduce weight | `-11.6%` |
| `robots.txt` / `bf-cache` audits | Both failing | Both passing | Pass | Fixed |
| `og:image` (`1200x630` PNG) | Missing (`null`) | `/og-en.png` (`200 image/png`) | Present & valid | Fixed |
| JSON-LD Schemas | `0` | `Organization`, `SoftwareApplication`, `FAQPage` | All 3 (no fake ratings) | Fixed |
| Axe WCAG A/AA violations | `0` | `0` | `0` | Pass |

---

## 3. Issues Found & Fixed

### SEO & Indexation

1. **`/robots.txt`, `/sitemap.xml`, and `/og-*.png` blocked by auth middleware:**
   - Added `/robots.txt`, `/sitemap.xml`, `/og-ar.png`, and `/og-en.png` to `evaluateMiddlewareDecision` public pass-through in [`src/lib/authz-rules.ts`](../src/lib/authz-rules.ts) and excluded `robots.txt` / `sitemap.xml` from `config.matcher` in [`src/middleware.ts`](../src/middleware.ts).
   - Added [`src/app/robots.ts`](../src/app/robots.ts) (explicitly allowing `/`, `/en`, `/help`, `/og-ar.png`, `/og-en.png`, and disallowing `/dashboard`, `/log`, `/admin`, `/login`, `/menu`, `/imports`, `/reports`, `/settings`, `/api`, `/design-check`) and [`src/app/sitemap.ts`](../src/app/sitemap.ts) (including `ar-SA`, `en`, and `x-default` `xhtml:link` alternates).
2. **Missing Open Graph / Twitter cards & Arabic text shaping limitation in `next/og`:**
   - Added [`scripts/generate-og-images.ts`](../scripts/generate-og-images.ts) (`pnpm og:generate`, documented in [`README.md`](../README.md)) using Playwright Chromium HTML templates to render `1200x630` [`public/og-ar.png`](../public/og-ar.png) and [`public/og-en.png`](../public/og-en.png) with full Arabic shaping and high contrast; wired them into [`src/features/landing/landing-metadata.ts`](../src/features/landing/landing-metadata.ts) (`twitter.card = "summary_large_image"`).
3. **Missing structured data (JSON-LD):**
   - Added [`src/features/landing/landing-jsonld.ts`](../src/features/landing/landing-jsonld.ts) and rendered `Organization`, `SoftwareApplication` (real SAR plan pricing, zero fake ratings or reviews), and `FAQPage` (built dynamically from `faq.q1..q6`) in [`src/features/landing/landing-page.tsx`](../src/features/landing/landing-page.tsx).
4. **Private / app routes lacked explicit `noindex` directives:**
   - Created [`src/lib/seo.ts`](../src/lib/seo.ts) presets (`NOINDEX_METADATA`, `NOINDEX_PLACEHOLDER_METADATA`), exported `metadata` on all authenticated/login/admin/placeholder pages (`/login`, `/dashboard`, `/log`, `/admin`, `/menu`, `/imports`, `/reports`, `/reports/[month]`, `/settings/notifications`, `/settings/staff`, `/design-check`, `/privacy`, `/terms`), and added `X-Robots-Tag: noindex, nofollow` HTTP headers in [`next.config.ts`](../next.config.ts).

### Performance

1. **Bloated SSR Flight / `NextIntlClientProvider` payload on public pages:**
   - Baseline SSR HTML on `/` included ~42 KB of authenticated SaaS translations serialized by `RootLayout`. Slimmed [`src/app/layout.tsx`](../src/app/layout.tsx) to serialize only `{ common }` at root, moved full app translations and `<ServiceWorkerRegistrar />` to [`src/components/shell/app-shell.tsx`](../src/components/shell/app-shell.tsx), and scoped `landing.leadForm` translations directly to `<FinalCta>` inside [`src/features/landing/landing-page.tsx`](../src/features/landing/landing-page.tsx) (eliminating build-time `MISSING_MESSAGE` warnings and cutting SSR HTML by `27%` on `/` and `22%` on `/en`).
2. **Double font subsetting & render overhead on `/en`:**
   - Restricted `IBM_Plex_Sans_Arabic` in [`src/app/layout.tsx`](../src/app/layout.tsx) to `subsets: ["arabic"]` so `Inter` handles Latin exclusively, dropping `/en` font transfer by `59.7 KB` (`24.2%`).
3. **Below-the-fold interactive bundle splitting & icon pruning:**
   - Split [`src/features/landing/savings-calculator.tsx`](../src/features/landing/savings-calculator.tsx) (`next/dynamic` -> [`savings-calculator-panel.tsx`](../src/features/landing/savings-calculator-panel.tsx)) and [`src/features/landing/pilot-lead-form-loader.tsx`](../src/features/landing/pilot-lead-form-loader.tsx) (`next/dynamic` -> [`pilot-lead-form.tsx`](../src/features/landing/pilot-lead-form.tsx)) with `{ ssr: true }`, and removed `lucide-react` imports from `pilot-lead-form.tsx`.
4. **BFCache restoration failure (`Cache-Control: no-store`):**
   - Configured `Cache-Control: public, max-age=0, must-revalidate` for `/` and `/en` in [`next.config.ts`](../next.config.ts), turning Lighthouse `bf-cache` green on both locales.

### Accessibility

1. **Sequential headings & landmarks:** Changed footer `<h3>` headings to `<h2>` in [`src/features/landing/landing-footer.tsx`](../src/features/landing/landing-footer.tsx) (`h1` -> `h2` -> `h3` cleanly ordered without skips) and replaced nested `role="region"` wrappers with `role="group"` in [`src/features/landing/hero-product-mock.tsx`](../src/features/landing/hero-product-mock.tsx).
2. **Gold-on-dark contrast & skip target focus:** Updated `#C9A227` small caption text in [`src/features/landing/landing-footer.tsx`](../src/features/landing/landing-footer.tsx) to `#F3CF5E` (`6.26:1+` contrast on `#072621`) and made `<main id="main-content">` focusable (`tabIndex={-1}`) for the skip-to-content link.
3. **Keyboard focus rings, form error focus & live announcement:** Added `:focus-visible` ring styling to range sliders in `savings-calculator-panel.tsx`, `role="alert"` on field validation errors in [`lead-form-controls.tsx`](../src/features/landing/lead-form-controls.tsx) and [`pilot-lead-form-fields.tsx`](../src/features/landing/pilot-lead-form-fields.tsx), auto-focus on the first invalid field on failed submit, and `tabIndex={-1}` focus transfer to `#pilot-form-success` on successful submission.

### Content & Honesty QA

1. **Honesty rules ([`docs/LANDING.md`](./LANDING.md)):** Verified all savings language uses explicit qualifiers (`estimated` / `تقديري`) across hero subtitle, monthly report feature card title, net-savings comparison label (`messages/ar.json`), and FAQ `q3`; confirmed zero unverified logos, testimonials, awards, fake review counts, or live Foodics API claims (CSV import today + Foodics on roadmap only).
2. **Arabic RTL bidirectional punctuation & dead-key cleanup:** Isolated `-16%` in `messages/ar.json` `landing.hero.mock.kpiDeltaValue` with Unicode `LRI`/`PDI` isolates (`\u2066-16%\u2069`), wrapped mock KPI numerals and calculator range min/max labels in `<bdi dir="ltr">` (keeping range bounds visually aligned with the RTL slider thumb while keeping `%` properly ordered), enforced 100% AR/EN key parity, and removed unused `landing.finalCta.placeholder*` copy keys.

---

## 4. Remaining Gaps / Pre-Launch Checklist

1. **Verified source citations (`src/config/sources.ts`):** The two industry statistic sources (`src1`, `src2`) still carry `isPlaceholder: true` and `url: null` (rendered cleanly without invented URLs). Populate verified public URLs (e.g., SAGO / FAO official reports) in `src/config/sources.ts` before launch.
2. **Production environment variables (`.env`):** Before deploying to a public domain, configure `NEXT_PUBLIC_SITE_URL` (`https://...` so canonical, `hreflang`, sitemap, OG URLs, and JSON-LD point to the real domain instead of `http://localhost:3000`), `NEXT_PUBLIC_WHATSAPP_NUMBER`, `FOUNDER_EMAIL`, and `RESEND_API_KEY`.
3. **Legal copy (`/privacy` and `/terms`):** Both routes remain `noindex, follow` placeholder pages per `docs/LANDING.md`; replace with reviewed PDPL privacy policy and terms of service prior to public paid launch.
4. **Remaining Lighthouse informational opportunities:** Lighthouse still notes ~`117 KiB` combined unused JS across the Next.js / React hydration runtime and CSS render-blocking (`~390–410 ms` simulated 4G stylesheet load), while Performance scores `99` (`/`) and `100` (`/en`) with LCP `0.8–1.0 s`.
