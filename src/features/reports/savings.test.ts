import { describe, expect, it } from "vitest";
import {
  calculateMonthlySavings,
  computeRecommendationAdherence,
  parseMonthWindow,
  ReportsValidationError,
  resolveBaselineWindow,
} from "./index";

describe("baseline resolution and savings math", () => {
  it("resolves default 14-day baseline when unconfigured and detects calibration progress", () => {
    const completed = resolveBaselineWindow({
      configuredStart: null,
      configuredEnd: null,
      firstWasteDate: "2026-07-16",
      asOfDateKey: "2026-08-31",
    });
    expect(completed).toEqual({
      startDate: "2026-07-16",
      endDate: "2026-07-29",
      days: 14,
      isCustom: false,
      isCalibrating: false,
      calibratingDaysLeft: 0,
    });

    const calibrating = resolveBaselineWindow({
      configuredStart: null,
      configuredEnd: null,
      firstWasteDate: "2026-11-05",
      asOfDateKey: "2026-11-12",
    });
    expect(calibrating.isCalibrating).toBe(true);
    expect(calibrating.calibratingDaysLeft).toBe(6);

    const noEntries = resolveBaselineWindow({
      configuredStart: null,
      configuredEnd: null,
      firstWasteDate: null,
      asOfDateKey: "2026-11-13",
    });
    expect(noEntries.isCalibrating).toBe(true);
    expect(noEntries.calibratingDaysLeft).toBe(14);

    const custom = resolveBaselineWindow({
      configuredStart: "2026-08-01",
      configuredEnd: "2026-08-21",
      firstWasteDate: "2026-07-16",
      asOfDateKey: "2026-09-30",
    });
    expect(custom.isCustom).toBe(true);
    expect(custom.days).toBe(21);
    expect(custom.isCalibrating).toBe(false);
  });

  it("computes volume-adjusted positive savings even when higher volume raised total waste", () => {
    const result = calculateMonthlySavings({
      baselineWindow: {
        startDate: "2026-07-16",
        endDate: "2026-07-29",
        days: 14,
        isCustom: false,
        isCalibrating: false,
        calibratingDaysLeft: 0,
      },
      baselineMetrics: {
        startDate: "2026-07-16",
        endDate: "2026-07-29",
        days: 14,
        wasteSar: "1000",
        entryCount: 40,
        unitsSold: "500",
        salesCount: 40,
      },
      currentMetrics: {
        startDate: "2026-08-01",
        endDate: "2026-08-28",
        days: 28,
        wasteSar: "2250",
        entryCount: 80,
        unitsSold: "1500",
        salesCount: 80,
      },
    });

    expect(result.isEstimate).toBe(true);
    expect(result.status).toBe("READY");
    expect(result.method).toBe("VOLUME_ADJUSTED");
    expect(result.outcome).toBe("SAVED");
    // baseline: 2.00 SAR/unit -> expected on 1500 units = 3000.00 SAR vs actual 2250.00 -> 750.00 SAR saved
    expect(result.volumeAdjustedSavingsSar).toBe("750.00");
    expect(result.headlineAmountSar).toBe("750.00");
    expect(result.rawWeeklySavingsSar).toBe("-250.00");
    expect(result.expectedWasteAtBaselineSar).toBe("3000.00");
    expect(result.variancePct).toBe("-25");
  });

  it("reports negative savings honestly as INCREASED with positive magnitude", () => {
    const result = calculateMonthlySavings({
      baselineWindow: {
        startDate: "2026-07-16",
        endDate: "2026-07-29",
        days: 14,
        isCustom: false,
        isCalibrating: false,
        calibratingDaysLeft: 0,
      },
      baselineMetrics: {
        startDate: "2026-07-16",
        endDate: "2026-07-29",
        days: 14,
        wasteSar: "1000",
        entryCount: 40,
        unitsSold: "500",
        salesCount: 40,
      },
      currentMetrics: {
        startDate: "2026-11-01",
        endDate: "2026-11-14",
        days: 14,
        wasteSar: "1400",
        entryCount: 35,
        unitsSold: "500",
        salesCount: 35,
      },
    });

    expect(result.outcome).toBe("INCREASED");
    expect(result.headlineAmountSar).toBe("400.00");
    expect(result.signedDeltaSar).toBe("-400.00");
    expect(result.variancePct).toBe("40");
  });

  it("falls back to RAW_WEEKLY when sales are unavailable in either period and handles calibrating & zero baseline", () => {
    const raw = calculateMonthlySavings({
      baselineWindow: {
        startDate: "2026-07-16",
        endDate: "2026-07-29",
        days: 14,
        isCustom: false,
        isCalibrating: false,
        calibratingDaysLeft: 0,
      },
      baselineMetrics: {
        startDate: "2026-07-16",
        endDate: "2026-07-29",
        days: 14,
        wasteSar: "1400",
        entryCount: 30,
        unitsSold: "0",
        salesCount: 0,
      },
      currentMetrics: {
        startDate: "2026-08-01",
        endDate: "2026-08-21",
        days: 21,
        wasteSar: "1500",
        entryCount: 45,
        unitsSold: "900",
        salesCount: 21,
      },
    });
    expect(raw.method).toBe("RAW_WEEKLY");
    expect(raw.hasSalesForBothPeriods).toBe(false);
    expect(raw.volumeAdjustedSavingsSar).toBeNull();
    // 700/wk baseline - 500/wk current = 200/wk * 3 wks = 600.00 SAR
    expect(raw.headlineAmountSar).toBe("600.00");

    const calibrating = calculateMonthlySavings({
      baselineWindow: {
        startDate: "2026-11-05",
        endDate: "2026-11-18",
        days: 14,
        isCustom: false,
        isCalibrating: true,
        calibratingDaysLeft: 5,
      },
      baselineMetrics: {
        startDate: "2026-11-05",
        endDate: "2026-11-18",
        days: 14,
        wasteSar: "400",
        entryCount: 10,
        unitsSold: "0",
        salesCount: 0,
      },
      currentMetrics: {
        startDate: "2026-11-01",
        endDate: "2026-11-13",
        days: 13,
        wasteSar: "400",
        entryCount: 10,
        unitsSold: "0",
        salesCount: 0,
      },
    });
    expect(calibrating.status).toBe("CALIBRATING");
    expect(calibrating.outcome).toBe("CALIBRATING");
    expect(calibrating.calibratingDaysLeft).toBe(5);
    expect(calibrating.headlineAmountSar).toBe("0.00");

    const zeroBase = calculateMonthlySavings({
      baselineWindow: {
        startDate: "2026-07-01",
        endDate: "2026-07-14",
        days: 14,
        isCustom: true,
        isCalibrating: false,
        calibratingDaysLeft: 0,
      },
      baselineMetrics: {
        startDate: "2026-07-01",
        endDate: "2026-07-14",
        days: 14,
        wasteSar: "0",
        entryCount: 0,
        unitsSold: "0",
        salesCount: 0,
      },
      currentMetrics: {
        startDate: "2026-08-01",
        endDate: "2026-08-07",
        days: 7,
        wasteSar: "10.005",
        entryCount: 2,
        unitsSold: "0",
        salesCount: 0,
      },
    });
    expect(zeroBase.isZeroBaseline).toBe(true);
    expect(zeroBase.outcome).toBe("INCREASED");
    expect(zeroBase.headlineAmountSar).toBe("10.01");
    expect(zeroBase.variancePct).toBeNull();
  });

  it("clamps active month window cleanly and validates YYYY-MM format", () => {
    const partial = parseMonthWindow("2026-11", "2026-11-13");
    expect(partial.monthStartDate).toBe("2026-11-01");
    expect(partial.periodEndDate).toBe("2026-11-13");
    expect(partial.days).toBe(13);

    const past = parseMonthWindow("2026-08", "2026-11-13");
    expect(past.periodEndDate).toBe("2026-08-31");
    expect(past.days).toBe(31);

    expect(() => parseMonthWindow("2026-13", "2026-11-13")).toThrow(
      ReportsValidationError,
    );
  });

  it("derives adherence only when paired forecast+purchase days overlap", () => {
    expect(
      computeRecommendationAdherence({
        forecasts: [{ menuItemId: "a", dateKey: "2026-08-01", recommendedQty: "10" }],
        purchases: [{ menuItemId: "b", dateKey: "2026-08-01", quantity: "10" }],
      }).derivable,
    ).toBe(false);

    const paired = computeRecommendationAdherence({
      forecasts: [
        { menuItemId: "a", dateKey: "2026-08-01", recommendedQty: "100" },
        { menuItemId: "a", dateKey: "2026-08-02", recommendedQty: "100" },
      ],
      purchases: [
        { menuItemId: "a", dateKey: "2026-08-01", quantity: "115" }, // exact 15% edge -> followed
        { menuItemId: "a", dateKey: "2026-08-02", quantity: "120" }, // 20% -> ignored
      ],
    });
    expect(paired).toEqual({
      derivable: true,
      pairedDays: 2,
      followedCount: 1,
      ignoredCount: 1,
      adherencePct: "50",
      tolerancePct: 15,
    });
  });
});
