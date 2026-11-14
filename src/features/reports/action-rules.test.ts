import { describe, expect, it } from "vitest";
import {
  buildReportDailyCsv,
  calculateMonthlySavings,
  generateSuggestedActions,
} from "./index";

describe("report suggested action rules and CSV export", () => {
  it("generates up to 3 deterministic suggested actions and BOM+formula-safe daily CSV", () => {
    const savings = calculateMonthlySavings({
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
        entryCount: 20,
        unitsSold: "500",
        salesCount: 20,
      },
      currentMetrics: {
        startDate: "2026-08-01",
        endDate: "2026-08-28",
        days: 28,
        wasteSar: "2600",
        entryCount: 40,
        unitsSold: "1000",
        salesCount: 40,
      },
    });

    const actions = generateSuggestedActions({
      items: [
        {
          menuItemId: "rice",
          name: "Basmati Rice",
          nameAr: "أرز بسمتي",
          unit: "KG",
          monthWasteSar: "1200",
          monthWasteQty: "100",
          baselineWeeklyWasteSar: "150",
          monthWeeks: "4",
          peakWeekday: 4,
          peakWeekdayAvgQty: "10",
        },
      ],
      reasons: [
        {
          reason: "OVER_PREPARATION",
          sarCost: "1400.00",
          sharePct: "53.8",
          entryCount: 25,
        },
      ],
      hotspotPeak: {
        weekday: 4,
        shift: "EVENING",
        sarCost: "900.00",
        entryCount: 18,
      },
      missingLoggingDaysCount: 2,
      savings,
    });

    expect(actions).toHaveLength(3);
    expect(actions.map((a) => a.ruleKey)).toEqual([
      "itemPeakReduction",
      "dominantReasonOverPrep",
      "shiftHotspot",
    ]);

    const csv = buildReportDailyCsv(
      [
        {
          dateKey: "=cmd|'/C calc'!A0",
          wasteEntryCount: 3,
          wasteQtySum: "4.5",
          wasteSar: "90.00",
          unitsSold: "100",
          wasteSarPerUnit: "0.9000",
          purchaseSar: "500.00",
        },
      ],
      ["Date", "Entries", "Qty", "Waste SAR", "Units", "SAR/Unit", "Purch SAR"],
    );
    expect(csv.startsWith("\uFEFFDate,Entries")).toBe(true);
    expect(csv).toContain("'=cmd|'/C calc'!A0");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("handles itemTopShareReduction, loggingGap, and sustainReduction fallback actions", () => {
    const baseSavings = calculateMonthlySavings({
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
        wasteSar: "2000",
        entryCount: 40,
        unitsSold: "1000",
        salesCount: 40,
      },
      currentMetrics: {
        startDate: "2026-08-01",
        endDate: "2026-08-28",
        days: 28,
        wasteSar: "2500",
        entryCount: 50,
        unitsSold: "2000",
        salesCount: 50,
      },
    });

    const fallbackTopAndGap = generateSuggestedActions({
      items: [
        {
          menuItemId: "chicken",
          name: "Whole Chicken",
          nameAr: "دجاج",
          unit: "PORTION",
          monthWasteSar: "900",
          monthWasteQty: "60",
          baselineWeeklyWasteSar: "0",
          monthWeeks: "4",
          peakWeekday: null,
          peakWeekdayAvgQty: "12",
        },
      ],
      reasons: [],
      hotspotPeak: null,
      missingLoggingDaysCount: 3,
      savings: baseSavings,
    });

    expect(fallbackTopAndGap.map((a) => a.ruleKey)).toEqual([
      "itemTopShareReduction",
      "loggingGap",
      "sustainReduction",
    ]);
    expect(fallbackTopAndGap[0]?.params.suggestedCut).toBe("3");

    const emptyActions = generateSuggestedActions({
      items: [],
      reasons: [],
      hotspotPeak: null,
      missingLoggingDaysCount: 0,
      savings: {
        ...baseSavings,
        status: "CALIBRATING",
        outcome: "CALIBRATING",
      },
    });
    expect(emptyActions).toEqual([]);
  });
});
