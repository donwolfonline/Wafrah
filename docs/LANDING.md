# Wafrah Public Marketing Landing Page — Specification & Copy Governance

> **Scope note:** This document captures product decisions, routing architecture, copy structure, SEO, telemetry, and verification items for the public marketing landing page (`/` and `/en`). **No UI components or lead-capture routes are implemented in this step.**

---

## 1. Product Positioning, Audience & Tone

- **Primary Goal:** Collect pilot sign-ups from restaurant and hotel owners/managers in **Riyadh** (founding cohort capped at **15 pilot restaurants**).
  - **Primary CTA:** `"احجز مكانك في التجربة"` / `"Request a spot in the pilot"` (scrolls to and focuses `#pilot-form`).
  - **Secondary CTA:** WhatsApp chat (`https://wa.me/${NEXT_PUBLIC_WHATSAPP_NUMBER}`).
- **Target Audience:** Saudi restaurant owners, F&B directors, and hotel hospitality managers browsing primarily on **mobile phones** (**assume 80%+ mobile traffic**).
  - **Primary language:** Arabic (`ar`, RTL).
  - **Secondary language:** English (`en`, LTR).
  - **Layout implication:** Single-column mobile-first flow, compact above-the-fold hero (`44px+` touch targets), minimal scroll friction to the calculator and pilot form, logical CSS properties everywhere (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`).
- **Tone:** Confident, plain, practical, and operator-focused. Saudi business Arabic written naturally rather than translated word-for-word. Zero hype, zero marketing jargon, zero unverified superlatives.

---

## 2. Honesty & Anti-Hype Rules (Mandatory)

Every public claim on `/` and `/en` must follow these rules:

1. **No fabricated social proof:** No customer logos, no testimonials, no `"trusted by"` sections, no award badges, no fake live counters (e.g., `"12 spots left"` unless strictly manual/static copy matching `"limited places"`), and **no stock photos of people**. Visuals should rely on clean typography, metric callouts, interactive calculator UI, or illustrative product/diagram SVGs.
2. **Sourced statistics only:** Every numeric statistic in the **Problem** section must show a visible citation badge linking to the **Sources** section, populated dynamically from `src/config/sources.ts` (placeholder entries until the owner inserts verified URLs/citations — **never invent URLs**).
3. **Always qualify savings as estimated:** Hero, How It Works, Calculator, Pricing/Features, and FAQ #3 must explicitly say **تقديري / estimated**. Never promise guaranteed savings percentages.
4. **Honest POS integration wording:** State clearly: *"Import sales from any POS via CSV today; direct Foodics integration is on the roadmap."* (`استيراد المبيعات من أي نظام نقاط بيع عبر CSV اليوم، والربط المباشر مع فودكس ضمن خارطة الطريق.`).
5. **No invented legal claims:** Privacy Policy and Terms & Conditions links point directly to `/privacy` and `/terms` (currently placeholder pages in `src/app/privacy` and `src/app/terms`).

---

## 3. Routing, `next-intl` Adaptation & Security Guardrails

### Current Behavior in Repo
- `src/i18n/request.ts` resolves locale exclusively from the `NEXT_LOCALE` cookie (then `User.locale` in DB, defaulting to `"ar"`).
- `src/app/layout.tsx` calls `getAppLocale()`, sets `<html lang={locale} dir={dir}>`, and loads `IBM_Plex_Sans_Arabic` + `Inter`.
- `src/lib/authz-rules.ts` (`evaluateMiddlewareDecision`) currently redirects unauthenticated visitors from `/` to `/login`, and redirects authenticated users from `/` and `/login` to `getRoleHomePath(role)` (`/log`, `/dashboard`, or `/admin`). `/privacy`, `/terms`, and `/help` are already accessible unauthenticated.

### Target Public Path-Based Routing (`"as-needed"` for Public Routes Only)
Keep **all authenticated app routes unprefixed and cookie/profile driven** (`/login`, `/log`, `/dashboard`, `/menu`, `/imports`, `/reports`, `/settings/*`, `/admin`, `/api/*`), while giving public marketing routes clean crawlable URLs:

| URL | Locale | Direction | Page Purpose |
| --- | --- | --- | --- |
| `/` | `ar` | `rtl` | Primary Arabic marketing landing page |
| `/en` | `en` | `ltr` | English marketing landing page |
| `/privacy`, `/terms`, `/help` | cookie / query / route | RTL/LTR | Existing public legal & help pages (optional `/en/privacy`, `/en/terms`, `/en/help` mirrors if needed later) |

### Implementation Plan (for UI Step)
1. **Middleware locale injection without breaking app cookies (`src/middleware.ts`):**
   - For `/en` (and optional `/en/*` public paths), set an internal request header such as `x-wafrah-public-locale: en`.
   - For `/` (when served as the public landing page), set `x-wafrah-public-locale: ar`.
   - Update `getAppLocale()` in `src/i18n/request.ts` to inspect `headers().get("x-wafrah-public-locale")` **first** (validating `"ar" | "en"`), before falling back to `NEXT_LOCALE` cookie -> DB user locale -> `"ar"`.
   - **Why:** Crawlers and visitors sharing `/` or `/en` receive the exact HTML `<html lang>` + `<html dir>` + copy for that URL regardless of prior browser cookies, while authenticated app sessions under `/dashboard`, `/log`, etc. continue obeying `NEXT_LOCALE` and `User.locale` untouched.
2. **Route authorization updates (`src/lib/authz-rules.ts`):**
   - Allow unauthenticated `{ type: "next" }` for `/`, `/en`, `/en/privacy`, `/en/terms`, `/en/help`, `POST /api/leads` (future pilot form endpoint), and `POST /api/telemetry/landing` (if first-party telemetry endpoint is added).
   - **Authenticated root `/` behavior decision:** When an already-signed-in user visits `/` or `/en`, **recommended behavior** is to render the landing page with a header `"Go to workspace"` button (`getRoleHomePath(role)`) instead of auto-redirecting away from `/` — otherwise restaurant owners/founders testing live or sharing links while logged in cannot preview the landing page. (`/login` continues auto-redirecting authenticated users to `homePath`.) Confirm this preference with the owner before implementing.
3. **Language switcher & SEO alternates:**
   - Landing header switcher uses `<Link href="/en">` on `/` and `<Link href="/">` on `/en` (real anchor links for crawlability, not cookie-only JS toggles).
   - Set Next.js `generateMetadata` on `/` and `/en` using `metadataBase: new URL(NEXT_PUBLIC_SITE_URL)`:
     - `alternates.canonical`: `"/"` on `/`, `"/en"` on `/en`
     - `alternates.languages`: `{ "ar-SA": "/", en: "/en", "x-default": "/" }`
   - Keep `robots.txt` / `sitemap.xml` indexing only public pages (`/`, `/en`, `/help`, `/privacy`, `/terms`) and disallowing `/api/*`, `/dashboard`, `/log`, `/admin`, `/settings/*`.

---

## 4. Ordered Page Sections & UX Spec

All copy keys live under `landing.*` in `messages/ar.json` and `messages/en.json`.

### 1. Header & Hero
- **Header:** Brand mark (`Wafrah وفرة`), language link (`English` / `العربية`), `"Sign in"` (`/login`) or `"Go to workspace"` when authenticated, compact pilot jump link on desktop/tablet.
- **Hero:**
  - Title, practical subheadline mentioning 10-second logging, weekly buy/prep recommendations, and savings in SAR.
  - Primary CTA button (`Request a spot in the pilot` -> smooth-scrolls to `#pilot-form` and focuses first input).
  - Secondary CTA button (`Chat on WhatsApp` -> `https://wa.me/${NEXT_PUBLIC_WHATSAPP_NUMBER}` in new tab with `rel="noopener noreferrer"`).
  - Urgency/scarcity note anchored to truth (`"Limited places in the first pilot in Riyadh"`).

### 2. Problem (`landing.problem`)
- **Heading:** `"الهدر يأكل هامش ربحك بصمت"` / `"Waste quietly eats your margin"`
- **Items (3):**
  1. **Stat 1:** `47 مليار ريال` — `خسائر هدر الطعام سنوياً في السعودية` + `[1]` footnote badge linking to `#sources`.
  2. **Stat 2:** `26%` — `متوسط هدر المطاعم من مشترياتها` + `[2]` footnote badge linking to `#sources`.
  3. **Statement 3 (NOT a stat card):** `"ربع فاتورة المشتريات تُرمى دون أن يلاحظ أحد"` / `"A quarter of the purchasing bill goes in the bin, unnoticed."`
     - **Visual distinction rule:** Style Item 3 as an editorial callout / summary pull-quote spanning the full row beneath the two stat cards (without big KPI badge styling or a source footnote number), clearly framing it as an intuitive plain-language takeaway from those numbers rather than a separate citation.

### 3. How It Works (`landing.howItWorks`)
- Numbered 3-step sequence:
  1. **سجّل / Log:** Phone or tablet in seconds, works even offline.
  2. **افهم / Understand:** Abnormal spike alerts revealing item, day, and shift drivers.
  3. **قرّر / Decide:** Weekly buy & prep quantity recommendations with the reason why + monthly estimated-savings report.

### 4. Features (`landing.features`)
- 6 cards with scannable icon + title + 1 plain sentence grounded in real `SPEC.md` capabilities:
  1. **Fast logging that works offline** — Local queue saves entries in the browser when Wi-Fi drops and syncs automatically once back online.
  2. **Smart spike alerts** — Compares daily waste per item against that weekday's baseline and flags unusually high drops above minimum thresholds.
  3. **Weekly recommendations with the "why"** — Suggests weekly purchasing and prep quantities from recent demand and shortage vs. waste cost, explaining the logic clearly.
  4. **Printable monthly savings report in Arabic** — Executive summary comparing current waste to your initial baseline, showing estimated SAR saved, top items, and print/PDF layout.
  5. **Arabic-first, English supported** — Designed right-to-left for Saudi teams, with instant switching to English for managers and kitchen staff.
  6. **Import sales from any POS via CSV** — Import sales and purchasing data from any POS via CSV today; direct Foodics integration is on the roadmap.

### 5. Interactive Savings Calculator (`landing.calculator`)
- Pure client-side interactive widget (zero API calls, works cleanly with `Decimal` or integer arithmetic).
- **Inputs (with sensible mobile sliders + numeric steppers):**
  - **Monthly food & ingredient purchases (`SAR`):** Default `50,000` SAR (step `5,000`, range `5,000` – `500,000`).
  - **Estimated current waste share of purchases (`%`):** Default `10%` (step `1%`, range `2%` – `35%`). *Keep conservative default of 10% distinct from the 26% sector average so numbers feel credible to operators.*
  - **Conservative waste reduction target (`%` of current waste):** Default `20%` (step `5%`, range `10%` – `40%`).
- **Outputs:**
  - Estimated monthly food waste cost (`SAR`)
  - **Estimated monthly savings (`SAR / month`)** — visibly tagged `تقديري / Estimated`
  - **Estimated annual savings (`SAR / year`)** — visibly tagged `تقديري / Estimated`
- **Mandatory disclaimer:** Explains the exact arithmetic (`Purchases × Current Waste % × Reduction %`), clarifies these are rough illustrative estimates (not guaranteed savings), and notes that live tracking in Wafrah compares actual logged waste against your first 14-day baseline.
- Includes CTA button (`"احجز مكانك في التجربة"`) scrolling to `#pilot-form`.

### 6. Pilot Offer & Pricing (`landing.pricing`)
- **Heading:** `"اشتراك شهري بسيط"` / `"Simple monthly subscription"`
- **Pilot offer callout:** `"التجربة الأولى: فترة تجريبية مجانية لأول 15 مطعماً"` / `"Founding pilot: a free trial period for the first 15 restaurants"`
- **3 Tiers (`SAR per month`):**
  1. **Small restaurant (`مطعم صغير`):** `400` SAR / month
  2. **Medium restaurant (`مطعم متوسط`):** `700` SAR / month
  3. **Hotel / chain (`فندق / سلسلة`):** `1,200` SAR / month
- **VAT footnote (`landing.pricing.vatNote`):** Empty string `""` in both `ar.json` and `en.json` by default. UI renders the VAT note container **only** when `vatNote.trim().length > 0`.

### 7. FAQ (`landing.faq`)
- 6 concise accordions (1–3 sentences each):
  1. POS / Foodics integration (CSV from any POS today; direct Foodics API on the roadmap).
  2. Offline operation (local browser storage + automatic sync on reconnect).
  3. How savings are estimated (14-day initial baseline, optional sales-volume adjustment, always marked estimated with method shown inside the report).
  4. Kitchen devices & staff setup (works on existing phones/tablets; simple restaurant code + username + short numeric PIN).
  5. Data privacy & tenant separation (account-level isolation, role permissions, link to `/privacy`; no unverified legal compliance assertions).
  6. Pilot trial & post-pilot commitment (neutral placeholder copy — pilot length, onboarding schedule, and post-trial options are agreed individually when joining).

### 8. Final CTA + Lead Capture Form (`landing.leadForm`, anchor `#pilot-form`)
- **Fields & Validation Spec (for API + Zod schema in UI step):**
  1. `name` — Full name (`string`, required, 2–100 chars)
  2. `restaurantName` — Restaurant or hotel name (`string`, required, 2–120 chars)
  3. `city` — Enum: `"MAKKAH"` | `"JEDDAH"` | `"OTHER"`
  4. `role` — Your role (`string`, required, 2–80 chars, e.g. Owner, General Manager, Chef)
  5. `phone` — Mobile / WhatsApp (`string`, required, validated Saudi/international phone pattern)
  6. `email` — Email (`string`, optional, standard email format if non-empty)
  7. `branchesCount` — Number of branches (`integer`, required, `1`–`500`)
  8. `currentPos` — Enum: `"FOODICS"` | `"MARN"` | `"OTHER"` | `"NONE"`
  9. `consent` — Boolean checkbox (`true` required): agrees to be contacted about the pilot, linked alongside `/privacy`.
- **Submission behavior (future implementation note):**
  - Store in DB (`PilotLead` table or equivalent), send optional email notification to `FOUNDER_EMAIL` if `RESEND_API_KEY` is configured (fail-safe so DB save still succeeds if email fails), rate-limit `POST /api/leads` per IP, validate with Zod.
  - Success confirmation: `"تم استلام طلبك، سنتواصل معك خلال يوم عمل"` / `"Request received. We'll contact you within one business day"`.

### 9. Sources & Footer (`landing.sources`, `landing.footer`)
- **Sources block:** Reads ordered citation items from `src/config/sources.ts` so citations stay decoupled from translation prose. Renders clearly labeled placeholder notices until verified URLs are entered.
- **Footer:** Compact product summary for Riyadh hospitality operators, links to `/privacy`, `/terms`, `/help`, `/login`, WhatsApp link, contact email (`FOUNDER_EMAIL` exposed only via server action/mailto if explicitly intended, or contact form/support email), and copyright.

---

## 5. `src/config/sources.ts` Contract (Placeholder Specification)

When implementing UI code, create `src/config/sources.ts` with typed placeholder entries — **do not invent external URLs**:

```ts
export interface StatSource {
  id: "national_food_waste_loss" | "restaurant_purchase_waste_share";
  number: 1 | 2;
  /** Short publisher/report label in Arabic (placeholder until owner verifies) */
  titleAr: string;
  /** Short publisher/report label in English (placeholder until owner verifies) */
  titleEn: string;
  /** Issuing organization / report year, or null until verified */
  publisherYear: string | null;
  /** Verified URL from owner; null renders plain non-linked placeholder note */
  url: string | null;
  isPlaceholder: boolean;
}

export const LANDING_SOURCES: readonly StatSource[] = [
  {
    id: "national_food_waste_loss",
    number: 1,
    titleAr: "[مصدر قيد التحقق: قيمة الهدر الغذائي السنوي في المملكة — أضف اسم الدراسة والرابط]",
    titleEn: "[PLACEHOLDER: Verify primary national Saudi food waste loss report & URL]",
    publisherYear: null,
    url: null,
    isPlaceholder: true,
  },
  {
    id: "restaurant_purchase_waste_share",
    number: 2,
    titleAr: "[مصدر قيد التحقق: نسبة هدر المطاعم من المشتريات — أضف اسم الدراسة والرابط]",
    titleEn: "[PLACEHOLDER: Verify restaurant purchasing waste benchmark report & URL]",
    publisherYear: null,
    url: null,
    isPlaceholder: true,
  },
];
```

---

## 6. Environment Variables & CSP Compatibility

Added to `.env.example`:

| Variable | Visibility | Format & Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Public client/server | International format, **digits only** (no `+`, spaces, or hyphens), e.g. `966500000000`. Builds `https://wa.me/<digits>`. |
| `FOUNDER_EMAIL` | Server-only | Notification recipient when a pilot lead is submitted (via `RESEND_API_KEY` / `EMAIL_FROM`), and server-rendered contact address if shown. |
| `NEXT_PUBLIC_SITE_URL` | Public client/server | Canonical site base URL without trailing slash (e.g. `https://wafrah.sa`), used for `metadataBase`, canonical links, `hreflang`, and sitemap/robots. |

**CSP check (`next.config.ts`):**
- Current policy sets `connect-src 'self'`, `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `img-src 'self' blob: data:`.
- WhatsApp links use standard `<a href="https://wa.me/...">` external navigation (unaffected by `connect-src`).
- First-party lead submission (`POST /api/leads`) and first-party analytics (`POST /api/telemetry/landing` or Vercel Analytics if enabled on Vercel) stay within `'self'`. Any third-party script or telemetry endpoint added later would require extending `CSP` in `next.config.ts`.

---

## 7. SEO Metadata & Keywords

### Proposed Meta Tags
- **Arabic (`/`):**
  - `title`: `وفرة — نظام ذكي لإدارة هدر الطعام في المطاعم والفنادق بالسعودية`
  - `description`: `سجّل هدر المطبخ في 10 ثوانٍ حتى بدون إنترنت، واحصل على توصيات شراء وتحضير أسبوعية وتقرير توفير تقديري بالريال. التجربة الأولى في الرياض.`
- **English (`/en`):**
  - `title`: `Wafrah — Smart Food Waste Management for Saudi Restaurants & Hotels`
  - `description`: `Log kitchen waste in 10 seconds even offline, get weekly buy-and-prep recommendations, and track estimated SAR savings. Founding pilot in Riyadh.`

### Target Keywords
- **Arabic:** إدارة هدر الطعام في المطاعم، تقليل تكلفة الغذاء، نظام تتبع هدر المطبخ، برنامج حساب الهدر الغذائي، تقليل هدر الفنادق السعودية، توقع المبيعات للمطاعم، الرياض، تكلفة المواد الغذائية.
- **English:** restaurant food waste management Saudi Arabia, kitchen waste tracking app, reduce food cost Riyadh, hospitality food waste software KSA, restaurant prep forecasting, Foodics CSV waste analytics.

---

## 8. Analytics & Telemetry Events

Prefer cookie-free, first-party event capture (zero PII in analytics payloads; no marketing cookies requiring consent banners beyond the lead form's contact consent):

| Event Name | Trigger | Recommended Non-PII Properties |
| --- | --- | --- |
| `cta_click` | User clicks any `"Request a spot in the pilot"` / `"احجز مكانك"` CTA | `locale` (`ar` \| `en`), `location` (`hero` \| `header` \| `calculator` \| `pricing`), `target` (`pilot_form`) |
| `whatsapp_click` | User clicks WhatsApp link | `locale` (`ar` \| `en`), `location` (`hero` \| `footer` \| `form_success`) |
| `calculator_used` | User interacts with savings calculator (fire once on first adjustment, plus optional CTA follow-through) | `locale` (`ar` \| `en`), `action` (`adjusted` \| `cta_click`), `purchasesBand` (`<25k` \| `25k-100k` \| `>100k`), `reductionPct` |
| `lead_submit` | User submits `#pilot-form` | `locale` (`ar` \| `en`), `city` (`MAKKAH` \| `JEDDAH` \| `OTHER`), `currentPos` (`FOODICS` \| `MARN` \| `OTHER` \| `NONE`), `branchesBand` (`1` \| `2-5` \| `6+`), `status` (`success` \| `validation_error` \| `server_error`) |

*(Never send `name`, `phone`, `email`, or free-text `restaurantName` in analytics events.)*

---

## 9. Claims & Decisions Requiring Owner Verification Before Launch

Review and sign off on every item below before deploying UI code or driving traffic:

| # | Area | Claim / Draft Choice in Copy | Owner Action Needed |
| --- | --- | --- | --- |
| 1 | **Problem — Stat 1** | `"47 مليار ريال — خسائر هدر الطعام سنوياً في السعودية"` | Provide the exact verified primary source name, year, report title, and official URL (e.g. SAGO / GFSA Saudi Food Loss & Waste baseline figure, often cited in SAR 40B vs 40–49B ranges) for `src/config/sources.ts`. |
| 2 | **Problem — Stat 2** | `"26% — متوسط هدر المطاعم من مشترياتها"` | Provide the exact verified study/report citation and URL confirming `26%` of purchases applies specifically to restaurants (as opposed to household/overall sector share), or adjust copy to match the exact cited study. |
| 3 | **Problem — Statement 3** | `"ربع فاتورة المشتريات تُرمى دون أن يلاحظ أحد"` | Confirm you want this editorial statement left live alongside Stat 2 (approx. `26%` ≈ a quarter), styled without a source citation. |
| 4 | **Hero Speed Claim** | `"يسجّل هدر الطعام في 10 ثوانٍ"` / `"logs kitchen waste in 10 seconds"` | Confirm actual kitchen tablet logging flow matches ≤10 seconds (`<10s` per `SPEC.md`: tap item, quantity, reason, assuming staff PIN session is unlocked). |
| 5 | **Calculator Defaults** | Default monthly purchases `50,000` SAR, default current waste `10%`, conservative reduction `20%` (slider ranges `5k–500k`, `2%–35%`, `10%–40%`) | Confirm default benchmark values reflect realistic Riyadh restaurant economics you feel comfortable standing behind publicly. |
| 6 | **Pricing & VAT** | Tiers: `400` / `700` / `1,200` SAR/mo (`Small` / `Medium` / `Hotel or chain`). `"vatNote"` is currently `""` (hidden) | Define exact tier limits (branch count, staff accounts, SKU count if any), confirm amounts, and specify VAT copy for `landing.pricing.vatNote` (e.g., excluding vs including 15% Saudi VAT once VAT-registered). |
| 7 | **Pilot Duration & Terms (FAQ #6 & Pilot Box)** | `"فترة تجريبية مجانية لأول 15 مطعماً"` + neutral FAQ #6 placeholder saying pilot length & terms are agreed directly when joining | Decide exact free trial duration (e.g., 30 days / 60 days / 90 days) and post-pilot commercial commitment so both can be stated clearly. |
| 8 | **15-Spot Cap Enforcement** | Landing promise caps first pilot cohort at `15` restaurants in Riyadh | Decide what happens when lead #16 submits (manual screening of applicants for the 15 pilot slots vs waitlist messaging). |
| 9 | **Response SLA in Lead Form** | `"تم استلام طلبك، سنتواصل معك خلال يوم عمل"` / `"within one business day"` | Confirm founder/team can honor a 1-business-day turnaround on incoming leads (or adjust to `"قريباً"` / `"soon"`). |
| 10 | **Legal Pages (`/privacy`, `/terms`)** | Placeholder legal routes exist in `src/app/privacy` & `src/app/terms`; Lead form asks for consent linking to Privacy Policy | Replace placeholder legal text with Saudi PDPL-reviewed Privacy Policy and Terms & Conditions (including lead data retention & cross-border hosting disclosure) before collecting real leads. |
| 11 | **Signed-in `/` Routing** | Proposed rendering landing page + `"Go to workspace"` header button even when signed in | Confirm whether signed-in users visiting `/` should stay on the landing page (recommended) or keep redirecting to `/dashboard` / `/log`. |
| 12 | **Contact Env Values** | `NEXT_PUBLIC_WHATSAPP_NUMBER`, `FOUNDER_EMAIL`, `NEXT_PUBLIC_SITE_URL` added as placeholders in `.env.example` | Provide production domain, active WhatsApp Business number (digits only), and founder email before deployment. |
