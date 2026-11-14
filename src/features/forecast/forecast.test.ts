import { describe, expect, it } from "vitest";
import { shiftDateKey, toTimeZoneDateKey } from "@/features/insights";
import {
  type ForecastItemInput,
  type ForecastSalesPoint,
  StatisticalForecaster,
} from "./index";

function makeItem(overrides: Partial<ForecastItemInput> = {}): ForecastItemInput {
  return {
    id: "item-1",
    code: "TST-1",
    name: "Test Kabsa",
    nameAr: "كبسة تجريبية",
    unit: "PORTION",
    salesUnitFactor: "1",
    unitCost: "10",
    shortageCost: null,
    ...overrides,
  };
}

function buildDailySeries(
  menuItemId: string,
  startDateKey: string,
  daysCount: number,
  qtyForDay: (dateKey: string, index: number) => string,
): ForecastSalesPoint[] {
  const rows: ForecastSalesPoint[] = [];
  for (let i = 0; i < daysCount; i++) {
    const dk = shiftDateKey(startDateKey, i);
    rows.push({
      menuItemId,
      date: dk,
      quantitySold: qtyForDay(dk, i),
    });
  }
  return rows;
}

describe("StatisticalForecaster", () => {
  const forecaster = new StatisticalForecaster();

  it("recovers a known 8-week weekday pattern and scales by salesUnitFactor", () => {
    // 56 days ending Thursday 2026-11-12 => horizon 2026-11-13 (Fri) .. 2026-11-19 (Thu)
    const startKey = shiftDateKey("2026-11-12", -55);
    const item = makeItem({
      id: "kabsa",
      unit: "KG",
      salesUnitFactor: "0.5",
      unitCost: "20",
      shortageCost: "30",
    });

    // Multi-channel raw sales that equal 80 KG every Friday (160 sold * 0.5) and 40 KG otherwise
    const sales: ForecastSalesPoint[] = [];
    for (let i = 0; i < 56; i++) {
      const dk = shiftDateKey(startKey, i);
      const weekday = new Date(`${dk}T00:00:00.000Z`).getUTCDay();
      const rawTotal = weekday === 5 ? 160 : 80;
      sales.push({ menuItemId: "kabsa", date: dk, quantitySold: String(rawTotal * 0.75) });
      sales.push({ menuItemId: "kabsa", date: dk, quantitySold: String(rawTotal * 0.25) });
    }

    const output = forecaster.forecast({
      items: [item],
      sales,
      options: { historyEndDate: "2026-11-12" },
    });

    expect(output.forecastStartDate).toBe("2026-11-13");
    expect(output.forecastEndDate).toBe("2026-11-19");
    const result = output.items[0]!;
    expect(result.status).toBe("OK");
    expect(result.days).toHaveLength(7);

    const friday = result.days[0]!; // 2026-11-13 is Friday
    expect(friday.weekday).toBe(5);
    expect(Number(friday.meanQty)).toBeCloseTo(80, 1);
    expect(friday.usedOverallFallback).toBe(false);

    const saturday = result.days[1]!;
    expect(Number(saturday.meanQty)).toBeCloseTo(40, 1);
  });

  it("applies Ramadan EventCalendar multipliers with tenant override priority", () => {
    const startKey = shiftDateKey("2026-11-12", -55);
    const sales = buildDailySeries("rice", startKey, 56, () => "100");
    const item = makeItem({ id: "rice", unit: "PORTION" });

    const output = forecaster.forecast({
      tenantId: "tenant-shami",
      items: [item],
      sales,
      events: [
        {
          tenantId: null,
          name: "Ramadan",
          startDate: "2026-11-13",
          endDate: "2026-11-15",
          demandMultiplier: "1.30",
        },
        {
          tenantId: "tenant-shami",
          name: "Private Banquet Weekend",
          startDate: "2026-11-14",
          endDate: "2026-11-14",
          demandMultiplier: "1.60",
        },
      ],
      options: { historyEndDate: "2026-11-12" },
    });

    const days = output.items[0]!.days;
    // 2026-11-13 uses global Ramadan 1.30
    expect(days[0]!.meanQty).toBe("130");
    expect(days[0]!.multipliers?.eventScope).toBe("GLOBAL");
    // 2026-11-14 overridden by tenant event 1.60
    expect(days[1]!.meanQty).toBe("160");
    expect(days[1]!.multipliers?.eventScope).toBe("TENANT");
    // 2026-11-16 outside event window -> 1.00
    expect(days[3]!.meanQty).toBe("100");
    expect(days[3]!.multipliers?.eventScope).toBe("NONE");
  });

  it("returns INSUFFICIENT_DATA when fewer than 14 days of history exist", () => {
    const startKey = shiftDateKey("2026-11-12", -12);
    const sales13 = buildDailySeries("new-item", startKey, 13, () => "25");
    const output = forecaster.forecast({
      items: [makeItem({ id: "new-item" }), makeItem({ id: "no-sales" })],
      sales: sales13,
      options: { historyEndDate: "2026-11-12" },
    });

    expect(output.insufficientDataItemIds).toEqual(["new-item", "no-sales"]);
    for (const itemResult of output.items) {
      expect(itemResult.status).toBe("INSUFFICIENT_DATA");
      for (const day of itemResult.days) {
        expect(day.meanQty).toBeNull();
        expect(day.lowQty).toBeNull();
        expect(day.highQty).toBeNull();
        expect(day.recommendedQty).toBeNull();
      }
    }
  });

  it("clamps trend factor to [0.8, 1.25]", () => {
    const startKey = shiftDateKey("2026-11-12", -55);
    const spikeSales = buildDailySeries("spike", startKey, 56, (_, idx) =>
      idx >= 42 ? "300" : "100",
    );
    const dropSales = buildDailySeries("drop", startKey, 56, (_, idx) =>
      idx >= 42 ? "30" : "100",
    );

    const output = forecaster.forecast({
      items: [makeItem({ id: "spike" }), makeItem({ id: "drop" })],
      sales: [...spikeSales, ...dropSales],
      options: { historyEndDate: "2026-11-12" },
    });

    expect(output.items[0]!.days[0]!.multipliers?.trendFactor).toBe("1.25");
    expect(output.items[1]!.days[0]!.multipliers?.trendFactor).toBe("0.8");
  });

  it("raises Newsvendor recommendedQty when shortageCost increases and handles fallback rules", () => {
    // 56 days with variance -> real backtest residuals >= 2
    const startKey = shiftDateKey("2026-11-12", -55);
    const variedSales = buildDailySeries("varied", startKey, 56, (_, idx) =>
      idx % 2 === 0 ? "120" : "80",
    );

    const lowShortageOut = forecaster.forecast({
      items: [makeItem({ id: "varied", unitCost: "20", shortageCost: "5" })],
      sales: variedSales,
      options: { historyEndDate: "2026-11-12" },
    });
    const highShortageOut = forecaster.forecast({
      items: [makeItem({ id: "varied", unitCost: "20", shortageCost: "80" })],
      sales: variedSales,
      options: { historyEndDate: "2026-11-12" },
    });

    const lowDay = lowShortageOut.items[0]!.days[0]!;
    const highDay = highShortageOut.items[0]!.days[0]!;
    expect(Number(highDay.criticalRatio)).toBeGreaterThan(
      Number(lowDay.criticalRatio),
    );
    expect(Number(highDay.recommendedQty)).toBeGreaterThan(
      Number(lowDay.recommendedQty),
    );
    expect(lowDay.usedFallbackSigma).toBe(false);

    // Zero-sales item with 15 explicit zero rows => OK & 0
    // Sparse item (only 14 days total, 2 per weekday) => overall mean & 0.25*mean fallback sigma
    const sparseDates = Array.from({ length: 14 }, (_, i) =>
      shiftDateKey("2026-11-12", -(i * 2)),
    ).reverse();
    const sparseSales: ForecastSalesPoint[] = sparseDates.map((dk) => ({
      menuItemId: "sparse",
      date: dk,
      quantitySold: "40",
    }));
    const zeroSales: ForecastSalesPoint[] = buildDailySeries(
      "zero",
      shiftDateKey("2026-11-12", -14),
      15,
      () => "0",
    );

    const fallbackOut = forecaster.forecast({
      items: [
        makeItem({ id: "sparse", unit: "KG", unitCost: "10", shortageCost: null }),
        makeItem({ id: "zero", unit: "PORTION", unitCost: "10" }),
      ],
      sales: [...sparseSales, ...zeroSales],
      options: { historyEndDate: "2026-11-12" },
    });

    const sparseDay = fallbackOut.items[0]!.days[0]!;
    expect(sparseDay.usedFallbackSigma).toBe(true);
    expect(sparseDay.meanQty).toBe("40");
    expect(sparseDay.sigma).toBe("10");
    expect(sparseDay.criticalRatio).toBe("0.6");

    const zeroDay = fallbackOut.items[1]!.days[0]!;
    expect(zeroDay.status).toBe("OK");
    expect(zeroDay.meanQty).toBe("0");
    expect(zeroDay.recommendedQty).toBe("0");

    // Verify timezone key helper alignment sanity
    expect(toTimeZoneDateKey(new Date("2026-11-12T22:00:00.000Z"))).toBe(
      "2026-11-13",
    );
  });
});
