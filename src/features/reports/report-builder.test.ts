import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import arMessages from "../../../messages/ar.json";
import enMessages from "../../../messages/en.json";
import { assembleMonthlyReport } from "./report-builder";
import { formatSuggestedActionText } from "./action-text";
import { parseMonthWindow } from "./validation";

describe("assembleMonthlyReport and formatSuggestedActionText", () => {
  it("assembles monthly view models cleanly with alerts, adherence, gaps, and empty hotspots", () => {
    const win = parseMonthWindow("2026-08", "2026-09-05");
    const report = assembleMonthlyReport({
      restaurant: {
        id: "r-1",
        code: "SHAMI-JED",
        name: "Al-Shami Grill",
        nameAr: "مشويات الشامي",
        city: "Jeddah",
        timezone: "Asia/Riyadh",
      },
      yearMonth: "2026-08",
      now: new Date("2026-09-05T10:00:00.000Z"),
      window: win,
      baselineWindow: {
        startDate: "2026-07-01",
        endDate: "2026-07-14",
        days: 14,
        isCustom: false,
        isCalibrating: false,
        calibratingDaysLeft: 0,
      },
      baselineMetrics: {
        startDate: "2026-07-01",
        endDate: "2026-07-14",
        days: 14,
        wasteSar: "1000",
        entryCount: 20,
        unitsSold: "500",
        salesCount: 20,
      },
      currWaste: { wasteSar: "1500", entryCount: 30 },
      currSales: { unitsSold: "1000", salesCount: 30 },
      monthItemRows: [
        {
          menuItemId: "item-1",
          code: "K-1",
          name: "Grilled Chicken",
          nameAr: "دجاج مشوي",
          unit: "KG",
          wasteQty: "50",
          wasteSar: "1500",
          entryCount: 30,
        },
      ],
      baseItemRows: [{ menuItemId: "item-1", wasteSar: "400" }],
      itemWeekdayRows: [
        {
          menuItemId: "item-1",
          weekday: 4,
          totalQty: "20",
          totalSar: "600",
          dayCount: 4,
        },
        {
          menuItemId: "item-1",
          weekday: 5,
          totalQty: "10",
          totalSar: "300",
          dayCount: 0,
        },
      ],
      reasonRows: [{ reason: "OVER_PREPARATION", wasteSar: "1500", entryCount: 30 }],
      hotspotRows: [],
      dailyWasteRows: [
        {
          dateKey: "2026-08-01",
          wasteSar: "100",
          wasteQtySum: "4",
          entryCount: 2,
        },
      ],
      dailySpRows: [
        { dateKey: "2026-08-01", unitsSold: "100", purchaseSar: "500" },
        { dateKey: "2026-08-02", unitsSold: "50", purchaseSar: "200" },
      ],
      rawAlerts: [
        {
          id: "alert-1",
          severity: "CRITICAL",
          status: "UNREAD",
          messageKey: "wasteSpike",
          messageParams: { item: "Chicken" },
          createdAt: new Date("2026-08-15T12:00:00.000Z"),
        },
        {
          id: "alert-2",
          severity: "WARNING",
          status: "UNREAD",
          messageKey: "wasteSpike",
          messageParams: null,
          createdAt: new Date("2026-08-16T12:00:00.000Z"),
        },
        {
          id: "alert-out-of-range",
          severity: "WARNING",
          status: "UNREAD",
          messageKey: "wasteSpike",
          messageParams: {},
          createdAt: new Date("2026-07-31T10:00:00.000Z"),
        },
      ],
      monthForecasts: [
        {
          menuItemId: "item-1",
          forDate: new Date("2026-08-01T00:00:00.000Z"),
          recommendedQty: new Prisma.Decimal("20"),
        },
      ],
      monthPurchases: [
        {
          menuItemId: "item-1",
          date: new Date("2026-08-01T00:00:00.000Z"),
          quantity: new Prisma.Decimal("20"),
        },
      ],
    });

    expect(report.alerts).toHaveLength(2);
    expect(report.hotspotPeak).toBeNull();
    expect(report.dailyRows[0]?.wasteSarPerUnit).toBe("1.0000");
    expect(report.dailyRows[2]?.wasteSarPerUnit).toBe("0.0000");

    const arText = formatSuggestedActionText(
      {
        id: "a1",
        ruleKey: "shiftHotspot",
        params: {
          itemName: "Chicken",
          itemNameAr: "دجاج",
          weekday: 4,
          shift: "EVENING",
          unit: "KG",
          sarCost: "500.00",
          entryCount: 10,
        },
      },
      "ar",
      arMessages,
    );
    expect(arText.length).toBeGreaterThan(10);

    const enFallbackText = formatSuggestedActionText(
      {
        id: "a2",
        ruleKey: "itemPeakReduction",
        params: {
          itemName: "Chicken",
          shift: "CUSTOM_SHIFT",
          unit: "BOX",
          suggestedCut: "2",
          pctChange: "25",
        },
      },
      "en",
      enMessages,
    );
    expect(enFallbackText).toContain("BOX");
  });
});
