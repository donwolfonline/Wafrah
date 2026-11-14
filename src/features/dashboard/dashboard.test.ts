import { describe, expect, it } from "vitest";
import {
  buildDailyTrendSeries,
  buildDashboardKpis,
  buildHeatmapMatrix,
  buildRankedReasons,
  buildRecommendationsRows,
  buildTopItemBars,
  computePeriodChange,
  parseDashboardRange,
  sortAlertsForDashboard,
} from "./index";

describe("dashboard pure aggregation helpers", () => {
  it("parses supported date ranges with 30-day fallback", () => {
    expect(parseDashboardRange(7)).toBe(7);
    expect(parseDashboardRange("7")).toBe(7);
    expect(parseDashboardRange(90)).toBe(90);
    expect(parseDashboardRange("90")).toBe(90);
    expect(parseDashboardRange("30")).toBe(30);
    expect(parseDashboardRange("14")).toBe(30);
    expect(parseDashboardRange(null)).toBe(30);
    expect(parseDashboardRange(undefined)).toBe(30);
  });

  it("computes signed period change percentage and zero-baseline behavior", () => {
    expect(computePeriodChange("120", "100")).toEqual({
      pctChange: "20",
      direction: "up",
    });
    expect(computePeriodChange("75", "100")).toEqual({
      pctChange: "-25",
      direction: "down",
    });
    expect(computePeriodChange("100", "100")).toEqual({
      pctChange: "0",
      direction: "flat",
    });
    expect(computePeriodChange("50", "0")).toEqual({
      pctChange: null,
      direction: "up",
    });
    expect(computePeriodChange("0", "0")).toEqual({
      pctChange: "0",
      direction: "flat",
    });
  });

  it("builds continuous daily trend with 7-day moving average lookback", () => {
    const series = buildDailyTrendSeries(
      [
        { dateKey: "2026-10-01", wasteSar: "70", entryCount: 2 },
        { dateKey: "2026-10-02", wasteSar: "70", entryCount: 1 },
        { dateKey: "2026-10-03", wasteSar: "70", entryCount: 1 },
        { dateKey: "2026-10-04", wasteSar: "70", entryCount: 1 },
        { dateKey: "2026-10-05", wasteSar: "70", entryCount: 1 },
        { dateKey: "2026-10-06", wasteSar: "70", entryCount: 1 },
        { dateKey: "2026-10-09", wasteSar: "140", entryCount: 3 },
      ],
      "2026-10-07",
      "2026-10-09",
      7,
    );

    expect(series).toEqual([
      { dateKey: "2026-10-07", wasteSar: "0", movingAvg7dSar: "60", entryCount: 0 },
      { dateKey: "2026-10-08", wasteSar: "0", movingAvg7dSar: "50", entryCount: 0 },
      { dateKey: "2026-10-09", wasteSar: "140", movingAvg7dSar: "60", entryCount: 3 },
    ]);
  });

  it("caps item waste chart at top 8 non-zero items with Pareto tiers", () => {
    const rows = Array.from({ length: 10 }, (_, idx) => ({
      menuItemId: `item-${idx}`,
      code: `C-${idx}`,
      name: `Item ${idx}`,
      nameAr: `صنف ${idx}`,
      unit: "KG" as const,
      wasteQty: String(idx + 1),
      wasteSar: idx === 9 ? "0" : String((10 - idx) * 100),
      entryCount: idx + 1,
    }));

    const bars = buildTopItemBars(rows, 8);
    expect(bars).toHaveLength(8);
    expect(bars[0]).toMatchObject({
      menuItemId: "item-0",
      wasteSar: "1000",
      tier: "HIGH",
    });
    expect(bars.every((b) => Number(b.wasteSar) > 0)).toBe(true);
    expect(bars.some((b) => b.tier === "MEDIUM")).toBe(true);
  });

  it("builds a complete 7x3 heatmap matrix with proportional intensity bands", () => {
    const heatmap = buildHeatmapMatrix([
      { weekday: 5, shift: "EVENING", wasteSar: "100", entryCount: 4 },
      { weekday: 5, shift: "MORNING", wasteSar: "60", entryCount: 2 },
      { weekday: 1, shift: "NIGHT", wasteSar: "30", entryCount: 1 },
      { weekday: 0, shift: "MORNING", wasteSar: "20", entryCount: 1 },
    ]);

    expect(heatmap.cells).toHaveLength(21);
    expect(heatmap.maxCellSar).toBe("100");
    expect(
      heatmap.cells.find((c) => c.weekday === 5 && c.shift === "EVENING"),
    ).toMatchObject({ wasteSar: "100", intensity: 4, entryCount: 4 });
    expect(heatmap.cells.find((c) => c.weekday === 5 && c.shift === "MORNING")?.intensity).toBe(3);
    expect(heatmap.cells.find((c) => c.weekday === 1 && c.shift === "NIGHT")?.intensity).toBe(2);
    expect(heatmap.cells.find((c) => c.weekday === 0 && c.shift === "MORNING")?.intensity).toBe(1);
    expect(heatmap.cells.find((c) => c.weekday === 2 && c.shift === "EVENING")?.intensity).toBe(0);
  });

  it("ranks waste reasons descending and derives purchase-optional KPI summary", () => {
    const reasons = buildRankedReasons([
      { reason: "EXPIRED", wasteSar: "50", entryCount: 2 },
      { reason: "OVER_PREPARATION", wasteSar: "150", entryCount: 5 },
    ]);
    expect(reasons).toEqual([
      {
        reason: "OVER_PREPARATION",
        sarCost: "150",
        sharePct: "75",
        entryCount: 5,
      },
      { reason: "EXPIRED", sarCost: "50", sharePct: "25", entryCount: 2 },
    ]);

    const withoutPurchases = buildDashboardKpis({
      rangeDays: 30,
      periodStartDate: "2026-10-15",
      periodEndDate: "2026-11-13",
      prevStartDate: "2026-09-15",
      prevEndDate: "2026-10-14",
      currentWasteSar: "200",
      prevWasteSar: "250",
      currentEntryCount: 7,
      prevEntryCount: 10,
      currentPurchases: { totalCostSar: "0", recordCount: 0 },
      prevPurchases: { totalCostSar: "0", recordCount: 0 },
      rankedReasons: reasons,
    });
    expect(withoutPurchases.hasPurchaseData).toBe(false);
    expect(withoutPurchases.wasteAsPctOfPurchases).toBeNull();
    expect(withoutPurchases.wasteCostChangePct).toBe("-20");
    expect(withoutPurchases.wasteCostDirection).toBe("down");
    expect(withoutPurchases.topReason?.reason).toBe("OVER_PREPARATION");

    const withPurchases = buildDashboardKpis({
      rangeDays: 30,
      periodStartDate: "2026-10-15",
      periodEndDate: "2026-11-13",
      prevStartDate: "2026-09-15",
      prevEndDate: "2026-10-14",
      currentWasteSar: "200",
      prevWasteSar: "100",
      currentEntryCount: 7,
      prevEntryCount: 5,
      currentPurchases: { totalCostSar: "2000", recordCount: 10 },
      prevPurchases: { totalCostSar: "2000", recordCount: 8 },
      rankedReasons: reasons,
    });
    expect(withPurchases.hasPurchaseData).toBe(true);
    expect(withPurchases.wasteAsPctOfPurchases).toBe("10");
    expect(withPurchases.prevWasteAsPctOfPurchases).toBe("5");
    expect(withPurchases.purchasePctChangePts).toBe("5");
    expect(withPurchases.purchasePctDirection).toBe("up");
  });

  it("sorts alerts by CRITICAL -> WARNING -> INFO, then UNREAD, then newest first", () => {
    const sorted = sortAlertsForDashboard([
      {
        id: "warn-read",
        menuItemId: null,
        type: "WASTE_SPIKE",
        severity: "WARNING",
        messageKey: "insights.alerts.wasteSpike",
        messageParams: {},
        status: "READ",
        createdAtIso: "2026-11-13T10:00:00.000Z",
      },
      {
        id: "crit-old",
        menuItemId: null,
        type: "WASTE_SPIKE",
        severity: "CRITICAL",
        messageKey: "insights.alerts.wasteSpike",
        messageParams: {},
        status: "UNREAD",
        createdAtIso: "2026-11-12T10:00:00.000Z",
      },
      {
        id: "warn-unread-new",
        menuItemId: null,
        type: "WASTE_SPIKE",
        severity: "WARNING",
        messageKey: "insights.alerts.wasteSpike",
        messageParams: {},
        status: "UNREAD",
        createdAtIso: "2026-11-13T11:00:00.000Z",
      },
    ]);

    expect(sorted.map((a) => a.id)).toEqual([
      "crit-old",
      "warn-unread-new",
      "warn-read",
    ]);
  });

  it("builds recommendations rows with Decimal safety margins and insufficient-data flags", () => {
    const rows = buildRecommendationsRows({
      menuItems: [
        {
          id: "item-ok",
          code: "SHM-RICE",
          name: "Mandi Rice",
          nameAr: "أرز مندي",
          unit: "KG",
        },
        {
          id: "item-new",
          code: "SHM-NEW",
          name: "New Dish",
          nameAr: "طبق جديد",
          unit: "PORTION",
        },
      ],
      horizonDates: ["2026-11-13"],
      salesDaysByItem: { "item-ok": 30, "item-new": 6 },
      forecasts: [
        {
          menuItemId: "item-ok",
          forDate: new Date("2026-11-13T00:00:00.000Z"),
          meanQty: "100.00",
          lowQty: "88.00",
          highQty: "112.00",
          recommendedQty: "106.25",
          inputsSnapshot: {
            sigma: "8.5",
            criticalRatio: "0.75",
            costOver: "10",
            costUnder: "30",
            multipliers: {
              weekdayMean: "90",
              eventMultiplier: "1.1",
              eventScope: "TENANT",
              eventName: "Weekend Rush",
              eventNameAr: "ذروة نهاية الأسبوع",
              trendFactor: "1.01",
            },
          },
        },
      ],
    });

    expect(rows[0]).toMatchObject({
      menuItemId: "item-ok",
      status: "OK",
      distinctSalesDays: 30,
    });
    expect(rows[0]?.days[0]).toMatchObject({
      forDate: "2026-11-13",
      safetyMarginQty: "6.25",
      why: {
        weekdayMean: "90",
        eventMultiplier: "1.1",
        eventNameAr: "ذروة نهاية الأسبوع",
        trendFactor: "1.01",
        criticalRatio: "0.75",
        safetyMarginQty: "6.25",
      },
    });
    expect(rows[1]).toMatchObject({
      menuItemId: "item-new",
      status: "INSUFFICIENT_DATA",
      distinctSalesDays: 6,
      days: [],
    });
  });
});
