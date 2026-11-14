export type PlanTierId = "small" | "medium" | "enterprise";

export type PurchasesBand = "under_40k" | "40k_to_120k" | "above_120k";

/** Monthly food purchase thresholds (SAR) mapping volume to Wafrah plans. */
export const PLAN_PURCHASE_THRESHOLDS = {
  smallUpperExclusive: 40_000,
  mediumUpperInclusive: 120_000,
} as const;

export const PLAN_MONTHLY_PRICES: Record<PlanTierId, number> = {
  small: 400,
  medium: 700,
  enterprise: 1_200,
} as const;

export const CALCULATOR_BOUNDS = {
  minPurchases: 0,
  maxPurchases: 5_000_000,
  sliderMinPurchases: 5_000,
  sliderMaxPurchases: 250_000,
  sliderStepPurchases: 1_000,
  minWastePct: 0,
  maxWastePct: 100,
  minReductionPct: 5,
  maxReductionPct: 30,
  monthsPerYear: 12,
} as const;

export const CALCULATOR_DEFAULTS = {
  monthlyPurchases: 60_000,
  wastePct: 26,
  reductionPct: 10,
} as const;

export interface CalculatorInputs {
  monthlyPurchases: number | string;
  wastePct: number | string;
  reductionPct: number | string;
}

export interface SanitizedCalculatorInputs {
  monthlyPurchases: number;
  wastePct: number;
  reductionPct: number;
  wasClamped: boolean;
}

export interface CalculatorResult {
  monthlyPurchases: number;
  wastePct: number;
  reductionPct: number;
  wasClamped: boolean;
  monthlyWasteCost: number;
  monthlySavings: number;
  yearlySavings: number;
  recommendedPlanId: PlanTierId;
  recommendedPlanPrice: number;
  coversPlanCost: boolean;
  netMonthlyAfterPlan: number;
  purchasesBand: PurchasesBand;
}

const DECIMAL_PLACES = 4;
const SCALE = BigInt(10_000);
const PERCENT_DENOM = BigInt(100);
const ROUNDING_OFFSET = SCALE / BigInt(2);

function parseBoundedScaledDecimal(
  raw: number | string,
  minValue: number,
  maxValue: number,
): { valueNumber: number; scaled: bigint; clamped: boolean } {
  const text =
    typeof raw === "number"
      ? Number.isFinite(raw)
        ? raw.toString()
        : "0"
      : raw.replace(/,/g, "").trim();

  if (!text) {
    const fallback = Math.max(0, minValue);
    return {
      valueNumber: fallback,
      scaled: BigInt(Math.round(fallback)) * SCALE,
      clamped: false,
    };
  }

  const normalized = text.replace(/^\+/, "");
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    const fallback = Math.max(0, minValue);
    return {
      valueNumber: fallback,
      scaled: BigInt(Math.round(fallback)) * SCALE,
      clamped: true,
    };
  }

  const isNegative = Boolean(match[1]);
  const wholePart = BigInt(match[2] ?? "0");
  const fracRaw = (match[3] ?? "").slice(0, DECIMAL_PLACES).padEnd(DECIMAL_PLACES, "0");
  const fracPart = BigInt(fracRaw || "0");
  let scaled = wholePart * SCALE + fracPart;
  if (isNegative) {
    scaled = -scaled;
  }

  const minScaled = BigInt(minValue) * SCALE;
  const maxScaled = BigInt(maxValue) * SCALE;
  let clamped = false;
  if (scaled < minScaled) {
    scaled = minScaled;
    clamped = true;
  } else if (scaled > maxScaled) {
    scaled = maxScaled;
    clamped = true;
  }

  return {
    valueNumber: Number(scaled) / Number(SCALE),
    scaled,
    clamped,
  };
}

function roundScaledToWholeSar(scaledValue: bigint): number {
  if (scaledValue <= BigInt(0)) {
    return 0;
  }
  return Number((scaledValue + ROUNDING_OFFSET) / SCALE);
}

export function sanitizeCalculatorInputs(
  inputs: CalculatorInputs,
): SanitizedCalculatorInputs {
  const purchases = parseBoundedScaledDecimal(
    inputs.monthlyPurchases,
    CALCULATOR_BOUNDS.minPurchases,
    CALCULATOR_BOUNDS.maxPurchases,
  );
  const waste = parseBoundedScaledDecimal(
    inputs.wastePct,
    CALCULATOR_BOUNDS.minWastePct,
    CALCULATOR_BOUNDS.maxWastePct,
  );
  const reduction = parseBoundedScaledDecimal(
    inputs.reductionPct,
    CALCULATOR_BOUNDS.minReductionPct,
    CALCULATOR_BOUNDS.maxReductionPct,
  );

  return {
    monthlyPurchases: purchases.valueNumber,
    wastePct: waste.valueNumber,
    reductionPct: reduction.valueNumber,
    wasClamped: purchases.clamped || waste.clamped || reduction.clamped,
  };
}

export function selectRecommendedPlan(monthlyPurchases: number): PlanTierId {
  if (monthlyPurchases < PLAN_PURCHASE_THRESHOLDS.smallUpperExclusive) {
    return "small";
  }
  if (monthlyPurchases <= PLAN_PURCHASE_THRESHOLDS.mediumUpperInclusive) {
    return "medium";
  }
  return "enterprise";
}

export function getPurchasesBand(monthlyPurchases: number): PurchasesBand {
  if (monthlyPurchases < PLAN_PURCHASE_THRESHOLDS.smallUpperExclusive) {
    return "under_40k";
  }
  if (monthlyPurchases <= PLAN_PURCHASE_THRESHOLDS.mediumUpperInclusive) {
    return "40k_to_120k";
  }
  return "above_120k";
}

/**
 * Computes illustrative monthly/annual waste savings using exact fixed-point integer
 * arithmetic (BigInt) so no IEEE-754 floating-point drift enters SAR values.
 */
export function calculateEstimatedSavings(
  inputs: CalculatorInputs,
): CalculatorResult {
  const purchases = parseBoundedScaledDecimal(
    inputs.monthlyPurchases,
    CALCULATOR_BOUNDS.minPurchases,
    CALCULATOR_BOUNDS.maxPurchases,
  );
  const waste = parseBoundedScaledDecimal(
    inputs.wastePct,
    CALCULATOR_BOUNDS.minWastePct,
    CALCULATOR_BOUNDS.maxWastePct,
  );
  const reduction = parseBoundedScaledDecimal(
    inputs.reductionPct,
    CALCULATOR_BOUNDS.minReductionPct,
    CALCULATOR_BOUNDS.maxReductionPct,
  );

  // wasteCost = purchases * (wastePct / 100)
  const monthlyWasteScaled =
    (purchases.scaled * waste.scaled) / (SCALE * PERCENT_DENOM);

  // monthlySavings = wasteCost * (reductionPct / 100)
  const monthlySavingsScaled =
    (monthlyWasteScaled * reduction.scaled) / (SCALE * PERCENT_DENOM);

  // yearlySavings = monthlySavings * 12
  const yearlySavingsScaled =
    monthlySavingsScaled * BigInt(CALCULATOR_BOUNDS.monthsPerYear);

  const recommendedPlanId = selectRecommendedPlan(purchases.valueNumber);
  const recommendedPlanPrice = PLAN_MONTHLY_PRICES[recommendedPlanId];
  const planPriceScaled = BigInt(recommendedPlanPrice) * SCALE;

  const coversPlanCost = monthlySavingsScaled >= planPriceScaled;
  const netAfterPlanScaled = coversPlanCost
    ? monthlySavingsScaled - planPriceScaled
    : BigInt(0);

  return {
    monthlyPurchases: purchases.valueNumber,
    wastePct: waste.valueNumber,
    reductionPct: reduction.valueNumber,
    wasClamped: purchases.clamped || waste.clamped || reduction.clamped,
    monthlyWasteCost: roundScaledToWholeSar(monthlyWasteScaled),
    monthlySavings: roundScaledToWholeSar(monthlySavingsScaled),
    yearlySavings: roundScaledToWholeSar(yearlySavingsScaled),
    recommendedPlanId,
    recommendedPlanPrice,
    coversPlanCost,
    netMonthlyAfterPlan: roundScaledToWholeSar(netAfterPlanScaled),
    purchasesBand: getPurchasesBand(purchases.valueNumber),
  };
}
