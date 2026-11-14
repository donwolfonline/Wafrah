import { describe, expect, it } from "vitest";
import { detectSpikes, shiftDateKey } from "@/features/insights";
import {
  decimalMad,
  decimalMedian,
  toTimeZoneDateKey,
} from "@/features/insights/math";
import type { SpikeSeriesItemMeta, SpikeSeriesPoint } from "@/features/insights";

function buildSeries(
  menuItemId: string,
  endDate: string,
  totalDays: number,
  qtyAt: (dateKey: string, idx: number) => string,
): SpikeSeriesPoint[] {
  const start = shiftDateKey(endDate, -(totalDays - 1));
  const points: SpikeSeriesPoint[] = [];
  for (let i = 0; i < totalDays; i++) {
    const dk = shiftDateKey(start, i);
    points.push({ menuItemId, dateKey: dk, quantity: qtyAt(dk, i) });
  }
  return points;
}

describe("insights math and spike tie-breaking edge cases", () => {
  it("handles empty decimalMedian/decimalMad arrays and dateKey strings", () => {
    const emptyMed = decimalMedian([]);
    expect(emptyMed.toString()).toBe("0");
    expect(decimalMad([], emptyMed).toString()).toBe("0");
    expect(toTimeZoneDateKey("2026-11-12")).toBe("2026-11-12");
  });

  it("breaks ties across equal-SAR days by zScore/dayKey and sorts equal-impact items deterministically", () => {
    const endDate = "2026-11-12";
    const items: SpikeSeriesItemMeta[] = [
      {
        id: "item-b",
        code: "B",
        name: "Item B",
        nameAr: "صنف ب",
        unit: "KG",
        unitCost: "25",
      },
      {
        id: "item-a",
        code: "A",
        name: "Item A",
        nameAr: "صنف أ",
        unit: "KG",
        unitCost: "25",
      },
      {
        id: "item-zero-base",
        code: "Z",
        name: "Zero Base",
        nameAr: "صفر",
        unit: "KG",
        unitCost: "20",
      },
    ];

    const series: SpikeSeriesPoint[] = [
      // item-a and item-b have identical series -> equal sarImpact & zScore -> sorted by menuItemId
      ...buildSeries("item-b", endDate, 35, (dk) =>
        dk === endDate || dk === shiftDateKey(endDate, -1) ? "10" : "2",
      ),
      ...buildSeries("item-a", endDate, 35, (dk) =>
        dk === endDate || dk === shiftDateKey(endDate, -1) ? "10" : "2",
      ),
      // zero baseline history -> median = 0, observed = 3 -> percentageChange = null
      {
        menuItemId: "item-zero-base",
        dateKey: shiftDateKey(endDate, -20),
        quantity: "0",
      },
      {
        menuItemId: "item-zero-base",
        dateKey: endDate,
        quantity: "3",
      },
    ];

    const result = detectSpikes({ dailySeries: series, items }, { asOfDate: endDate });
    expect(result.spikes.map((s) => s.menuItemId)).toEqual([
      "item-a",
      "item-b",
      "item-zero-base",
    ]);
    const zeroSpike = result.spikes.find((s) => s.menuItemId === "item-zero-base");
    expect(zeroSpike?.percentageChange).toBeNull();
  });
});
