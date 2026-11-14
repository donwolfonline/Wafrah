# SPEC.md — Wafrah Product Specification

**Wafrah** is an AI-powered food waste management SaaS built for restaurants and hotels in Saudi Arabia, starting with an MVP pilot of 10–15 restaurants in **Makkah** and **Jeddah**.

---

## 1. Problem

Restaurants and hotels in Saudi Arabia — particularly in high-volume hospitality hubs like Makkah and Jeddah with strong seasonal and religious demand swings — experience significant food waste due to over-purchasing, over-preparation, spoilage, and lack of visibility into item-level waste trends. Manual paper logs are slow, unreliable in busy kitchens, and disconnected from purchasing and prep decisions.

**Wafrah solves this by enabling kitchens to:**

- Log food waste in **under 10 seconds** (including offline in low-connectivity kitchen areas).
- Automatically detect abnormal waste patterns across items, shifts, and weekdays.
- Receive weekly data-driven purchase and prep quantity recommendations.
- Track tangible monthly financial savings in **SAR**.

### Performance & Quality Targets

- **Dashboard load time:** < 2 seconds
- **Waste entry local save:** < 1 second (offline-capable with background sync)
- **Accessibility:** WCAG AA color contrast compliance
- **Device support:** Responsive web UI built for kitchen tablets, mobile phones, and desktop browsers
- **Localization:** Arabic (default, RTL) and English (LTR); `SAR` currency; `Asia/Riyadh` business timezone

---

## 2. Users

| Role                   | Access & Responsibilities                                                                                                                                                              |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kitchen Staff**      | Log waste entries only (fast mobile/tablet workflow). Cannot access financial reports, menu pricing, or manager settings.                                                              |
| **Restaurant Manager** | Full operational access for their restaurant: KPI dashboard, menu/item management, CSV imports (sales & purchases), waste alerts, weekly recommendations, and monthly savings reports. |
| **Owner**              | All **Restaurant Manager** capabilities, plus multi-branch comparison (planned for post-MVP).                                                                                          |
| **Platform Admin**     | Internal Wafrah operator role; provisions and manages customer tenants and user accounts across the platform.                                                                          |

---

## 3. Core Flows

### Flow A: Fast Offline-First Waste Logging (Kitchen Staff)

1. Staff opens the waste logging screen on a kitchen tablet or phone.
2. **Pick item** from the restaurant's active menu/inventory list.
3. **Enter quantity** wasted (in the item's configured unit).
4. **Pick waste reason** from the standardized enum:
   - `EXPIRED` (Expired)
   - `OVER_PREPARATION` (Over-preparation)
   - `ORDER_ERROR` (Order error)
   - `CUSTOMER_RETURN` (Customer return)
   - `DAMAGED_IN_PREP` (Damaged in prep)
   - `OTHER` (Other)
5. **Shift is auto-detected** (`MORNING`, `EVENING`, `NIGHT`) based on the current `Asia/Riyadh` time and `Restaurant.shiftConfig`, and can be overridden by staff on the log screen.
6. Entry saves locally in **< 1s** and completes in **< 10s** end-to-end. If offline, the entry is queued locally and synced automatically when connectivity is restored.

### Flow B: Sales & Purchases CSV Import (Restaurant Manager)

1. Manager uploads CSV files containing historical/daily **sales** and **purchases** (optional) for their restaurant.
2. System validates rows with Zod, matches items by `MenuItem.code` then normalized AR/EN name, previews valid vs. rejected rows for manager confirmation, and idempotently upserts records scoped to `tenantId`.

### Flow C: Nightly Pattern Detection & Forecasting Job (System)

1. Protected HTTP endpoints (`x-cron-secret`) triggered nightly by Vercel Cron (around `03:00` `Asia/Riyadh` time; also runnable via a local script in development).
2. Computes item-level waste baselines, detects anomalies (capped at 5 new alerts/day per restaurant by SAR impact), updates daily demand forecasts, and calculates weekly purchase/prep quantity recommendations.

### Flow D: Manager Dashboard, Alerts & Weekly Recommendations (Restaurant Manager / Owner)

1. Manager views the dashboard (loads in **< 2s**):
   - **KPIs:** Total waste cost (`SAR`), waste weight/quantity, top wasted items, waste by reason and shift, and waste as % of purchases (shown only when purchase data exists in the same unit).
   - **Charts:** Waste trends over time, weekday/shift breakdowns, and demand forecast vs. actuals.
   - **Alerts:** Active pattern-detection anomalies requiring attention.
   - **Weekly Recommendations:** Suggested purchase and prep quantities per item for the upcoming week.

### Flow E: Monthly Savings Report (Restaurant Manager / Owner)

1. Manager views or exports a monthly report showing an **ESTIMATE** of financial savings in **SAR** (or `"waste increased by X SAR"` when waste rose) compared against the restaurant's 14-day baseline, alongside the calculation method used.

---

## 4. Data Model

All tenant-owned tables carry a mandatory `tenantId` column and are queried strictly through the shared tenant-scoping helper. All money and quantity fields use `Decimal` (`SAR` for currency); all timestamps are stored in `UTC`.

- **`Restaurant` (`Tenant`)**: Restaurant/hotel customer organization (`id`, `code`, `name`, `city` [e.g., Makkah, Jeddah], `timezone` [`Asia/Riyadh`], `shiftConfig` [JSON storing three shift start times: `MORNING` `05:00`, `EVENING` `15:00`, `NIGHT` `23:00`, editable by manager], `baselineStartDate`, `baselineEndDate`, `createdAt`).
- **`User`**: Authenticated user (`id`, `tenantId` [nullable only for `PLATFORM_ADMIN`], `email` [for Manager/Owner/Admin], `username` & `pinHash` [4–6 digit PIN for Kitchen Staff], `name`, `role` [`KITCHEN_STAFF`, `MANAGER`, `OWNER`, `PLATFORM_ADMIN`], `locale`).
- **`MenuItem`**: Unified catalog item for waste, sales, and purchases (`id`, `tenantId`, `code` [optional, unique per tenant for CSV matching], `nameAr`, `nameEn`, `category`, `unit` [`KG` | `LITER` | `PORTION` | `PIECE`], `salesUnitFactor` [`Decimal`, default `1`, converts sold quantity into `unit`], `unitCost` [`Decimal`, SAR], `shortageCost` [`Decimal`, SAR, optional manager entry, defaults to `1.5 * unitCost`], `isActive`).
- **`WasteLog`**: Individual waste event (`id`, `tenantId`, `itemId`, `loggedByUserId`, `quantity` [`Decimal`], `wasteCost` [`Decimal`, SAR], `reason` [`EXPIRED` | `OVER_PREPARATION` | `ORDER_ERROR` | `CUSTOMER_RETURN` | `DAMAGED_IN_PREP` | `OTHER`], `shift` [`MORNING` | `EVENING` | `NIGHT`], `occurredAt` [UTC], `clientEntryId` [for idempotent offline sync]).
- **`PurchaseRecord`**: Optional imported purchase line (`id`, `tenantId`, `itemId`, `quantity` [`Decimal`], `cost` [`Decimal`, SAR, optional], `purchasedDate`, `importBatchId`).
- **`SalesRecord`**: Imported sales/consumption line (`id`, `tenantId`, `itemId`, `quantitySold` [`Decimal`], `channel` [enum with default `UNSPECIFIED`], `salesDate`, `importBatchId`).
- **`CalendarEvent`**: Per-restaurant editable seasonal/holiday multiplier definitions (`id`, `tenantId`, `name`, `eventType` [`RAMADAN`, `EID_AL_FITR`, `EID_AL_ADHA`, `SCHOOL_HOLIDAY`, `HAJJ`], `startDate`, `endDate`, `multiplier` [`Decimal`, seeded at `1.0`]).
- **`WasteAlert`**: Output of nightly pattern detection (`id`, `tenantId`, `itemId`, `detectedDate`, `weekday`, `observedQuantity` [`Decimal`], `baselineMedian` [`Decimal`], `robustZScore` [`Decimal`], `severity` [`INFO` | `WARNING` | `CRITICAL`], `sarImpact` [`Decimal`, SAR], `status`).
- **`WeeklyRecommendation`**: Output of nightly demand forecasting + newsvendor optimization (`id`, `tenantId`, `itemId`, `weekStartDate`, `forecastMean` [`Decimal`], `sigma` [`Decimal`], `likelyLow` [`Decimal`], `likelyHigh` [`Decimal`], `criticalRatio` [`Decimal`], `recommendedQuantity` [`Decimal`], `generatedAt`).
- **`MonthlySavingsSummary`**: Aggregated monthly performance estimate (`id`, `tenantId`, `yearMonth`, `calculationMethod` [`VOLUME_ADJUSTED` | `RAW_WEEKLY`], `baselineWasteCostSar` [`Decimal`], `actualWasteCostSar` [`Decimal`], `estimatedSavingsSar` [`Decimal`], `wasteIncreaseSar` [`Decimal`], `generatedAt`).

---

## 5. Algorithms

### 5.1 Waste Pattern Detection

- **Per-item, weekday-aware baseline:** Uses each item's own historical median and Median Absolute Deviation ($\text{MAD}$) per weekday (`(tenantId, itemId, weekday)`).
- **Robust z-score with zero-inflation guard:**
  $$z_{\text{robust}} = \frac{\text{observed} - \text{median}}{\max(1.4826 \times \text{MAD},\; 0.15 \times \text{median},\; \text{minAbsQty})}$$
  where $\text{minAbsQty} = 0.5$ for `KG` / `LITER` and $1$ for `PORTION` / `PIECE`.
- **Thresholds & minimum impact:**
  - `WARNING` at $z_{\text{robust}} \ge 2.5$; `CRITICAL` at $z_{\text{robust}} \ge 3.5$.
  - Requires a minimum absolute increase of at least **1 unit** and **15 SAR**.
- **Cold-start handling:**
  - `< 14` days of waste history: no spike alerts (`INFO` "collecting data" state only).
  - `14–27` days: uses available days, severity capped at `WARNING`.
  - `28+` days: full behavior (`WARNING` and `CRITICAL`).
- **Alert fatigue control:** At most **5 new alerts per restaurant per day**, ranked by SAR impact.

### 5.2 Daily Demand Forecasting

- **Forecast target:** Predicts daily **demand** = `quantitySold` converted to the item's canonical unit via `MenuItem.salesUnitFactor` (does not forecast waste directly).
- **Per-item, per-weekday forecast:**
  $$\hat{y}_{i, d} = \text{EWM}_{i, \text{weekday}(d)} \times M_{\text{event}}(d) \times \text{clamp}(T_i, 0.8, 1.25)$$
  where:
  - $\text{EWM}_{i, \text{weekday}(d)}$ uses exponential weights with decay $0.8$ per week over the last **8 weeks** (requires at least 3 samples for that weekday, else falls back to the item's overall mean).
  - $M_{\text{event}}(d)$ is the restaurant's editable event multiplier for **Ramadan**, **Eid Al-Fitr**, **Eid Al-Adha**, **school holidays**, and **Hajj season** (`1–13 Dhul Hijjah` via `Intl` `islamic-umalqura`), seeded at neutral `1.0`.
  - $T_i = \frac{\text{mean of last 14 days}}{\text{mean of previous 28 days}}$, clamped to $[0.8, 1.25]$.
- **Uncertainty & likely range:**
  - $\sigma$ = standard deviation of one-step backtest residuals per weekday over the last **4 weeks** (fallback: $0.25 \times \text{mean}$).
  - **Likely range:** $\text{mean} \pm \sigma$.

### 5.3 Weekly Purchase / Prep Recommendation (Newsvendor Optimization)

- Computes the optimal stocking/prep target from forecasted demand ($\text{mean}, \sigma$) using the **Newsvendor Critical Ratio**:
  $$\text{CR} = \frac{\text{shortageCost}}{\text{shortageCost} + \text{unitCost}}$$
  where `shortageCost` is optional manager input defaulting to $1.5 \times \text{unitCost}$.

---

## 6. Non-Goals (Out of Scope for MVP)

- **Payments & billing:** No payment gateway, subscription checkout, or invoicing integration.
- **Live POS integration:** No real-time webhook or API integration with POS providers (Foodics, Oracle Micros, etc.); sales and purchases enter via CSV import.
- **Computer vision:** No camera-based or AI-image food waste recognition.
- **Native mobile apps:** No iOS or Android native binaries; delivered as an offline-capable responsive web app (PWA).

---

## 7. Roadmap

### Phase 1 — MVP Pilot (10–15 Restaurants in Makkah & Jeddah)

- Multi-tenant foundation with strict `tenantId` isolation and `ar` (default RTL) / `en` (LTR) localization.
- Role-based access for Kitchen Staff, Restaurant Manager, Owner (single-branch), and Platform Admin.
- Under-10-second offline-capable waste logging with auto-detected shifts and background sync.
- Manager CSV imports for sales and purchases.
- Nightly batch pipeline: robust z-score pattern detection, event-aware EWM demand forecasting, and newsvendor weekly recommendations.
- Manager dashboard (< 2s load) and monthly SAR savings report.

### Phase 2 — Post-Pilot Expansion

- **Owner multi-branch comparison:** Cross-branch benchmarking, consolidated KPIs, and branch-level rankings for multi-location restaurant groups.
- Calibrated city/region-specific event multipliers from pilot data.
- Automated POS connectors and supplier order sheet exports.

---

## 8. Decisions (resolved ambiguities)

1. **SAVINGS BASELINE:**
   - Baseline = the restaurant's first 14 days of waste logging (manager can adjust the dates).
   - If sales data exists, use a volume-adjusted figure: waste cost per unit sold in baseline vs. current, $\text{savings} = (\text{baselineRatio} - \text{currentRatio}) \times \text{currentUnitsSold}$.
   - Otherwise, use raw weekly waste cost vs. baseline.
   - Never compare against purchases or recommendations.
   - Always label the figure an **ESTIMATE** and display the calculation method used.
   - If waste increased, display `"waste increased by X SAR"` — never display negative savings.

2. **ITEM GRANULARITY:**
   - One unified item catalog (`MenuItem`) for waste, sales, and purchases. No recipes or Bill of Materials (BOM) in the MVP.
   - Supported units: `KG`, `LITER`, `PORTION`, `PIECE` only (decimals allowed, e.g., `0.25` kg; no `g` or `mL`).
   - To handle items sold in one unit but wasted in another (e.g., sold as portions, wasted in kg), include optional `MenuItem.salesUnitFactor` (`Decimal`, default `1`) that converts sold quantity into the item's unit.
   - Include optional `MenuItem.code` (unique per tenant) for CSV matching.
   - Purchases are optional; `"waste as % of purchases"` appears only when purchase data exists in the same unit.

3. **FORECAST TARGET:**
   - The forecast predicts daily **DEMAND** = `quantitySold` (converted to the item's unit via `salesUnitFactor`). It does not forecast waste.
   - The newsvendor step turns demand `mean` and `sigma` into a recommended prep/purchase quantity.
   - Unmet demand is not observable, so sales are treated as demand (documented as a known limitation).
   - `shortageCost` is manager-entered and optional; default = $1.5 \times \text{unitCost}$. Selling price is not collected in the MVP.

4. **HYPERPARAMETERS:**
   - **Pattern detection:**
     - $\text{robust z-score} = (\text{observed} - \text{median}) / \max(1.4826 \times \text{MAD},\; 0.15 \times \text{median},\; \text{minAbsQty})$, where $\text{minAbsQty} = 0.5$ for `KG`/`LITER` and $1$ for `PORTION`/`PIECE` (handles $\text{MAD} = 0$ for zero-inflated items).
     - Thresholds: `WARNING` at `2.5`, `CRITICAL` at `3.5`. "Dynamic per-restaurant" means each item's own median/MAD; there are no global fixed thresholds.
     - Minimum absolute change required: `1` unit and `15 SAR`.
   - **Cold start:**
     - `< 14` days of waste history for an item = no spike alerts, only an `INFO` `"collecting data"` state.
     - `14–27` days = use available days, cap severity at `WARNING`.
     - `28+` days = full behavior.
   - **Alert fatigue control:** At most `5` new alerts per restaurant per day, ranked by SAR impact.
   - **Forecast:**
     - Exponential weights with decay `0.8` per week over the last `8` weeks; at least `3` samples per weekday else fall back to the overall mean.
     - $\text{trend} = (\text{mean of last 14 days}) / (\text{mean of previous 28 days})$, clamped to $[0.8, 1.25]$.
     - Uncertainty $\sigma$ = standard deviation of one-step backtest residuals per weekday over the last `4` weeks (fallback $0.25 \times \text{mean}$); `"likely range"` = $\text{mean} \pm \sigma$.
   - **Event multipliers:**
     - Seed Ramadan, Eid Al-Fitr, Eid Al-Adha, school holidays, and Hajj season (`1–13 Dhul Hijjah`) with a **NEUTRAL** multiplier of `1.0` and make them editable per restaurant (to be calibrated from pilot data).
     - Hijri dates come from `Intl` `islamic-umalqura` and can be off by about one day (moon sighting); note this in the UI. Recent-weeks weighting already adapts to Ramadan after 1 to 2 weeks.

5. **SHIFTS:**
   - Three shifts for the MVP: `MORNING` `05:00–14:59`, `EVENING` `15:00–22:59`, `NIGHT` `23:00–04:59` (`Asia/Riyadh`).
   - Add `Restaurant.shiftConfig` (JSON, three start times) editable by the manager in settings so restaurants can adapt shift hours during Ramadan. No automatic Ramadan mode.
   - Staff can override the auto-detected shift on the waste log screen.

6. **CSV:**
   - **Sales columns:** `date`, `item` (code, or name in AR/EN), `quantitySold`, `channel` (optional).
   - **Purchases columns:** `date`, `item`, `quantity`, `cost` (optional).
   - **Dates accepted:** `YYYY-MM-DD`, `DD/MM/YYYY`, Excel serials.
   - **Item matching order:** `code`, then normalized name (AR or EN, case/diacritics-insensitive); unmatched names go to a mapping step.
   - **Missing channel:** `UNSPECIFIED` (default value in the `channel` enum).
   - **Partial import & idempotency:** Valid rows import after the manager confirms the preview; rejected rows are downloadable with reasons; reject the whole file only if required columns are missing or more than 50% of rows are invalid. Re-import is idempotent via upsert.

7. **AUTH:**
   - **Managers / Owners / Platform Admin:** Email + password.
   - **Kitchen Staff:** `restaurant code` + `username` + `4–6 digit PIN` on a shared tablet; the restaurant code is remembered on the device, and a `"Switch user"` button returns to the PIN pad. No magic links.

8. **NIGHTLY JOBS:**
   - Protected HTTP endpoints (`x-cron-secret`) triggered by Vercel Cron (daily around `03:00` Riyadh time), plus a local script for development. No separate worker process.

9. **SCHEMA IMPLICATIONS:**
   - `MenuItem.code` (optional, unique per tenant)
   - `MenuItem.salesUnitFactor` (`Decimal`, default `1`)
   - `Restaurant.shiftConfig` (JSON storing the three shift start times)
   - `SalesRecord.channel` enum includes `UNSPECIFIED` as the default value
