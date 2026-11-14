import { describe, expect, it } from "vitest";
import {
  aggregateWaste,
  classifyItems,
  dataGaps,
  detectSpikes,
  getDateKeyWeekday,
  shiftDateKey,
  topReasons,
} from "@/features/insights";
import type {
  InsightMenuItem,
  InsightWasteEntry,
  SpikeSeriesItemMeta,
  SpikeSeriesPoint,
} from "@/features/insights";

function makeItem(
  overrides: Partial<InsightMenuItem> = {},
): InsightMenuItem {
  return {
    id: "item-rice",
    code: "SHM-RICE",
    name: "Rice",
    nameAr: "أرز",
    unit: "KG",
    unitCost: "14.50",
    ...overrides,
  };
}

function buildDailySeries(
  menuItemId: string,
  endDate: string,
  totalDays: number,
  qtyForDate: (dateKey: string, dayOffsetFromStart: number) => string,
): SpikeSeriesPoint[] {
  const start = shiftDateKey(endDate, -(totalDays - 1));
  const points: SpikeSeriesPoint[] = [];
  for (let i = 0; i < totalDays; i++) {
    const dateKey = shiftDateKey(start, i);
    points.push({
      menuItemId,
      dateKey,
      quantity: qtyForDate(dateKey, i),
    });
  }
  return points;
}

describe("aggregateWaste", () => {
  it("groups entries in Asia/Riyadh timezone, ignores soft-deleted rows, and keeps Decimal precision", () => {
    const items = [
      makeItem({ id: "rice", unitCost: "10.00" }),
      makeItem({ id: "saffron", unit: "KG", unitCost: "0.30" }),
    ];
    const entries: InsightWasteEntry[] = [
      {
        menuItemId: "saffron",
        quantity: "0.1",
        reason: "OVER_PREPARATION",
        occurredAt: new Date("2026-11-11T20:30:00.000Z"), // 23:30 Riyadh on 2026-11-11
      },
      {
        menuItemId: "saffron",
        quantity: "0.2",
        reason: "EXPIRED",
        occurredAt: new Date("2026-11-11T21:30:00.000Z"), // 00:30 Riyadh on 2026-11-12
      },
      {
        menuItemId: "rice",
        quantity: "2.5",
        reason: "OVER_PREPARATION",
        occurredAt: new Date("2026-11-12T10:00:00.000Z"),
      },
      {
        menuItemId: "rice",
        quantity: "99",
        reason: "OTHER",
        occurredAt: new Date("2026-11-12T11:00:00.000Z"),
        deletedAt: new Date("2026-11-12T11:05:00.000Z"),
      },
    ];

    const result = aggregateWaste(entries, items);
    expect(result.totalEntries).toBe(3);
    expect(result.totalQuantity).toBe("2.8");
    expect(result.totalSarCost).toBe("25.09");
    expect(result.loggedDateKeys).toEqual(["2026-11-11", "2026-11-12"]);
    expect(result.dailyByItem.find((d) => d.dateKey === "2026-11-11")?.sarCost).toBe("0.03");
    expect(result.byReason[0]).toMatchObject({
      reason: "OVER_PREPARATION",
      sarCost: "25.03",
      entryCount: 2,
    });
  });

  it("handles empty and all-zero entries cleanly", () => {
    const empty = aggregateWaste([], [makeItem()]);
    expect(empty.totalEntries).toBe(0);
    expect(empty.totalSarCost).toBe("0");
    expect(empty.dailyByItem).toEqual([]);
  });
});

describe("detectSpikes", () => {
  const endDate = "2026-11-12";
  const riceMeta: SpikeSeriesItemMeta = makeItem({
    id: "rice",
    name: "Rice",
    unit: "KG",
    unitCost: "15.00",
  });

  it("detects WARNING (2.5 <= z < 3.5) and CRITICAL (z >= 3.5) spikes with accurate evidence", () => {
    // Stable baseline of 4.0 KG -> scale = max(0, 0.15*4, 0.5) = 0.6 KG.
    // WARNING: obs = 5.8 (+1.8 KG, +27 SAR, z = 3.00, +45%)
    const warningSeries = buildDailySeries("rice", endDate, 35, (dk) =>
      dk === endDate ? "5.8" : "4.0",
    );
    const warningRes = detectSpikes(
      { dailySeries: warningSeries, items: [riceMeta] },
      { asOfDate: endDate },
    );
    expect(warningRes.spikes).toHaveLength(1);
    expect(warningRes.spikes[0]).toMatchObject({
      severity: "WARNING",
      baseline: "4",
      observed: "5.8",
      zScore: "3",
      percentageChange: "45",
      absQtyChange: "1.8",
      sarImpact: "27",
      comparisonMode: "WEEKDAY",
    });

    // CRITICAL: obs = 7.0 (+3.0 KG, +45 SAR, z = 5.00, +75%)
    const criticalSeries = buildDailySeries("rice", endDate, 35, (dk) =>
      dk === endDate ? "7.0" : "4.0",
    );
    const criticalRes = detectSpikes(
      { dailySeries: criticalSeries, items: [riceMeta] },
      { asOfDate: endDate },
    );
    expect(criticalRes.spikes[0]?.severity).toBe("CRITICAL");
    expect(criticalRes.spikes[0]?.zScore).toBe("5");
  });

  it("ignores busy Thursday and Friday seasonality when >= 4 weekday samples exist", () => {
    const weekdayExpected = (dk: string) => {
      const wd = getDateKeyWeekday(dk);
      if (wd === 4) return "7.0"; // Thu
      if (wd === 5) return "8.0"; // Fri rush
      if (wd === 6) return "5.5"; // Sat
      return "4.0"; // Sun-Wed
    };
    const chickenMeta: SpikeSeriesItemMeta = makeItem({
      id: "chicken",
      code: "SHM-CHKN",
      name: "Chicken",
      unitCost: "24.00",
    });

    const series = [
      ...buildDailySeries("rice", endDate, 35, (dk) =>
        dk === endDate ? "11.0" : weekdayExpected(dk),
      ),
      ...buildDailySeries("chicken", endDate, 35, weekdayExpected),
    ];

    const res = detectSpikes(
      { dailySeries: series, items: [riceMeta, chickenMeta] },
      { asOfDate: endDate },
    );
    expect(res.spikes).toHaveLength(1);
    expect(res.spikes[0]?.menuItemId).toBe("rice");
    expect(res.spikes[0]?.comparisonMode).toBe("WEEKDAY");
  });

  it("falls back to OVERALL baseline (< 4 weekday samples) and enforces cold-start caps", () => {
    // 18 days total -> baseline has 15 days -> ~2 samples per weekday (< 4) -> OVERALL mode + max WARNING
    const mediumHistory = buildDailySeries("rice", endDate, 18, (dk) =>
      dk === endDate ? "9.0" : "4.0",
    );
    const mediumRes = detectSpikes(
      { dailySeries: mediumHistory, items: [riceMeta] },
      { asOfDate: endDate },
    );
    expect(mediumRes.spikes).toHaveLength(1);
    expect(mediumRes.spikes[0]?.comparisonMode).toBe("OVERALL");
    expect(mediumRes.spikes[0]?.severity).toBe("WARNING");

    // < 14 days (and < 7 days / single entry / all zeros) -> cold-start, zero alerts
    const shortHistory = buildDailySeries("rice", endDate, 5, (dk) =>
      dk === endDate ? "20.0" : "2.0",
    );
    const shortRes = detectSpikes(
      { dailySeries: shortHistory, items: [riceMeta] },
      { asOfDate: endDate },
    );
    expect(shortRes.spikes).toEqual([]);
    expect(shortRes.coldStartItemIds).toEqual(["rice"]);

    const singleEntry = detectSpikes(
      {
        dailySeries: [{ menuItemId: "rice", dateKey: endDate, quantity: "10" }],
        items: [riceMeta],
      },
      { asOfDate: endDate },
    );
    expect(singleEntry.spikes).toEqual([]);

    const allZeros = detectSpikes(
      {
        dailySeries: buildDailySeries("rice", endDate, 35, () => "0"),
        items: [riceMeta],
      },
      { asOfDate: endDate },
    );
    expect(allZeros.spikes).toEqual([]);
  });

  it("ignores tiny unit or tiny SAR deltas and caps alerts at 5 ranked by SAR impact", () => {
    const expensiveSpice = makeItem({ id: "spice", unit: "KG", unitCost: "100.00" });
    const cheapBread = makeItem({ id: "bread", unit: "PIECE", unitCost: "2.00" });
    const combinedSeries: SpikeSeriesPoint[] = [
      ...buildDailySeries("spice", endDate, 35, (dk) => (dk === endDate ? "0.9" : "0.1")),
      ...buildDailySeries("bread", endDate, 35, (dk) => (dk === endDate ? "6" : "1")),
    ];
    const ignoredRes = detectSpikes({ dailySeries: combinedSeries, items: [expensiveSpice, cheapBread] }, { asOfDate: endDate });
    expect(ignoredRes.spikes).toEqual([]);

    const manyItems = Array.from({ length: 7 }, (_, i) =>
      makeItem({ id: `item-${i}`, code: `I-${i}`, name: `Item ${i}`, unitCost: String((i + 1) * 10) }),
    );
    const manySeries = manyItems.flatMap((it) =>
      buildDailySeries(it.id, endDate, 35, (dk) => (dk === endDate ? "8.0" : "4.0")),
    );
    const capped = detectSpikes({ dailySeries: manySeries, items: manyItems }, { asOfDate: endDate });
    expect(capped.spikes).toHaveLength(5);
    expect(capped.spikes.map((s) => s.menuItemId)).toEqual(["item-6", "item-5", "item-4", "item-3", "item-2"]);
  });
});

describe("classifyItems, topReasons, and dataGaps", () => {
  it("classifies Pareto 50/30/20 waste cost tiers and handles all-zero totals", () => {
    const classified = classifyItems([
      { menuItemId: "a", sarCost: "45" }, // 0 -> 45% => HIGH
      { menuItemId: "b", sarCost: "20" }, // 45 -> 65% => HIGH
      { menuItemId: "c", sarCost: "14" }, // 65 -> 79% => MEDIUM
      { menuItemId: "d", sarCost: "12" }, // 79 -> 91% => MEDIUM
      { menuItemId: "e", sarCost: "9" }, // 91 -> 100% => LOW
    ]);
    expect(classified.map((c) => [c.menuItemId, c.tier])).toEqual([
      ["a", "HIGH"], ["b", "HIGH"], ["c", "MEDIUM"], ["d", "MEDIUM"], ["e", "LOW"],
    ]);
    expect(classifyItems([{ menuItemId: "a", sarCost: "0" }])[0]?.tier).toBe("LOW");
  });

  it("ranks reasons by SAR cost and detects missing waste days on expected sales days", () => {
    const items = [makeItem({ id: "x", unitCost: "20" })];
    const reasons = topReasons(
      [
        { menuItemId: "x", quantity: "1", reason: "EXPIRED" },
        { menuItemId: "x", quantity: "3", reason: "OVER_PREPARATION" },
        { menuItemId: "x", quantity: "5", reason: "OTHER", deletedAt: new Date() },
      ],
      items,
    );
    expect(reasons.map((r) => r.reason)).toEqual(["OVER_PREPARATION", "EXPIRED"]);
    expect(reasons[0]?.sarCost).toBe("60");

    const gaps = dataGaps(
      [
        { menuItemId: "x", quantity: "1", reason: "EXPIRED", occurredAt: new Date("2026-11-10T10:00:00.000Z") },
        { menuItemId: "x", quantity: "1", reason: "EXPIRED", occurredAt: new Date("2026-11-11T10:00:00.000Z"), deletedAt: new Date("2026-11-11T11:00:00.000Z") },
      ],
      [{ date: "2026-11-10" }, { date: "2026-11-11" }, { date: "2026-11-12" }],
      { maxDateKey: "2026-11-11" },
    );
    expect(gaps).toEqual([{ dateKey: "2026-11-11" }]);
  });
});
