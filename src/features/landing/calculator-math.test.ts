import { describe, expect, it } from "vitest";
import {
  CALCULATOR_BOUNDS,
  CALCULATOR_DEFAULTS,
  PLAN_MONTHLY_PRICES,
  PLAN_PURCHASE_THRESHOLDS,
  calculateEstimatedSavings,
  getPurchasesBand,
  sanitizeCalculatorInputs,
  selectRecommendedPlan,
} from "./calculator-math";

describe("landing savings calculator math", () => {
  it("computes exact illustrative savings for default inputs (60,000 SAR, 26%, 10%)", () => {
    const result = calculateEstimatedSavings(CALCULATOR_DEFAULTS);

    expect(result.monthlyPurchases).toBe(60_000);
    expect(result.wastePct).toBe(26);
    expect(result.reductionPct).toBe(10);
    expect(result.wasClamped).toBe(false);
    expect(result.monthlyWasteCost).toBe(15_600);
    expect(result.monthlySavings).toBe(1_560);
    expect(result.yearlySavings).toBe(18_720);
    expect(result.recommendedPlanId).toBe("medium");
    expect(result.recommendedPlanPrice).toBe(PLAN_MONTHLY_PRICES.medium);
    expect(result.coversPlanCost).toBe(true);
    expect(result.netMonthlyAfterPlan).toBe(860);
    expect(result.purchasesBand).toBe("40k_to_120k");
  });

  it("maps monthly purchases to small, medium, and enterprise plan thresholds consistently", () => {
    expect(selectRecommendedPlan(0)).toBe("small");
    expect(selectRecommendedPlan(39_999)).toBe("small");
    expect(selectRecommendedPlan(39_999.99)).toBe("small");
    expect(
      selectRecommendedPlan(PLAN_PURCHASE_THRESHOLDS.smallUpperExclusive),
    ).toBe("medium");
    expect(
      selectRecommendedPlan(PLAN_PURCHASE_THRESHOLDS.mediumUpperInclusive),
    ).toBe("medium");
    expect(
      selectRecommendedPlan(PLAN_PURCHASE_THRESHOLDS.mediumUpperInclusive + 1),
    ).toBe("enterprise");

    expect(getPurchasesBand(25_000)).toBe("under_40k");
    expect(getPurchasesBand(60_000)).toBe("40k_to_120k");
    expect(getPurchasesBand(150_000)).toBe("above_120k");
  });

  it("calculates net savings minus each plan price (400 / 700 / 1,200 SAR)", () => {
    const smallKitchen = calculateEstimatedSavings({
      monthlyPurchases: 30_000,
      wastePct: 26,
      reductionPct: 10,
    });
    expect(smallKitchen.recommendedPlanId).toBe("small");
    expect(smallKitchen.recommendedPlanPrice).toBe(400);
    expect(smallKitchen.monthlyWasteCost).toBe(7_800);
    expect(smallKitchen.monthlySavings).toBe(780);
    expect(smallKitchen.yearlySavings).toBe(9_360);
    expect(smallKitchen.coversPlanCost).toBe(true);
    expect(smallKitchen.netMonthlyAfterPlan).toBe(380);

    const hotel = calculateEstimatedSavings({
      monthlyPurchases: 200_000,
      wastePct: 26,
      reductionPct: 10,
    });
    expect(hotel.recommendedPlanId).toBe("enterprise");
    expect(hotel.recommendedPlanPrice).toBe(1_200);
    expect(hotel.monthlyWasteCost).toBe(52_000);
    expect(hotel.monthlySavings).toBe(5_200);
    expect(hotel.yearlySavings).toBe(62_400);
    expect(hotel.coversPlanCost).toBe(true);
    expect(hotel.netMonthlyAfterPlan).toBe(4_000);
  });

  it("never produces negative numbers when estimated savings are below the plan fee", () => {
    const lowEstimate = calculateEstimatedSavings({
      monthlyPurchases: 5_000,
      wastePct: 10,
      reductionPct: 5,
    });

    expect(lowEstimate.monthlyWasteCost).toBe(500);
    expect(lowEstimate.monthlySavings).toBe(25);
    expect(lowEstimate.yearlySavings).toBe(300);
    expect(lowEstimate.recommendedPlanId).toBe("small");
    expect(lowEstimate.recommendedPlanPrice).toBe(400);
    expect(lowEstimate.coversPlanCost).toBe(false);
    expect(lowEstimate.netMonthlyAfterPlan).toBe(0);
    expect(lowEstimate.netMonthlyAfterPlan).toBeGreaterThanOrEqual(0);
  });

  it("sanitizes negative, NaN, empty, and oversized inputs without absurd results", () => {
    const negative = calculateEstimatedSavings({
      monthlyPurchases: -50_000,
      wastePct: -20,
      reductionPct: 1,
    });
    expect(negative.wasClamped).toBe(true);
    expect(negative.monthlyPurchases).toBe(0);
    expect(negative.wastePct).toBe(0);
    expect(negative.reductionPct).toBe(CALCULATOR_BOUNDS.minReductionPct);
    expect(negative.monthlyWasteCost).toBe(0);
    expect(negative.monthlySavings).toBe(0);
    expect(negative.yearlySavings).toBe(0);
    expect(negative.netMonthlyAfterPlan).toBe(0);

    const oversized = calculateEstimatedSavings({
      monthlyPurchases: "999999999999",
      wastePct: 250,
      reductionPct: 90,
    });
    expect(oversized.wasClamped).toBe(true);
    expect(oversized.monthlyPurchases).toBe(CALCULATOR_BOUNDS.maxPurchases);
    expect(oversized.wastePct).toBe(CALCULATOR_BOUNDS.maxWastePct);
    expect(oversized.reductionPct).toBe(CALCULATOR_BOUNDS.maxReductionPct);
    expect(oversized.monthlySavings).toBe(1_500_000);

    const malformed = sanitizeCalculatorInputs({
      monthlyPurchases: "abc",
      wastePct: "",
      reductionPct: Number.NaN,
    });
    expect(malformed.monthlyPurchases).toBe(0);
    expect(malformed.wastePct).toBe(0);
    expect(malformed.reductionPct).toBe(CALCULATOR_BOUNDS.minReductionPct);
  });
});
