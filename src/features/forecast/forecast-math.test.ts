import { describe, expect, it } from "vitest";
import {
  inverseStandardNormalCdf,
  resolveEventMultiplier,
  roundToUnitStep,
  scoreForecasts,
} from "./index";

describe("Forecast math primitives and WAPE accuracy", () => {
  it("approximates inverseStandardNormalCdf accurately and validates bounds", () => {
    expect(inverseStandardNormalCdf(0.5)).toBe(0);
    expect(inverseStandardNormalCdf(0.6)).toBeCloseTo(0.2533471031, 6);
    expect(inverseStandardNormalCdf(0.75)).toBeCloseTo(0.6744897502, 6);
    expect(inverseStandardNormalCdf(0.841344746)).toBeCloseTo(1.0, 6);
    expect(inverseStandardNormalCdf(0.95)).toBeCloseTo(1.644853627, 6);
    expect(inverseStandardNormalCdf(0.975)).toBeCloseTo(1.9599639845, 6);
    expect(inverseStandardNormalCdf(0.025)).toBeCloseTo(-1.9599639845, 6);
    expect(inverseStandardNormalCdf(0.01)).toBeCloseTo(-2.326347874, 6);
    expect(inverseStandardNormalCdf(0.99)).toBeCloseTo(2.326347874, 6);

    expect(inverseStandardNormalCdf(0.15)).toBeCloseTo(
      -inverseStandardNormalCdf(0.85),
      9,
    );
    expect(inverseStandardNormalCdf(0)).toBe(-Infinity);
    expect(inverseStandardNormalCdf(1)).toBe(Infinity);
    expect(() => inverseStandardNormalCdf(-0.01)).toThrow(RangeError);
    expect(() => inverseStandardNormalCdf(1.01)).toThrow(RangeError);
    expect(() => inverseStandardNormalCdf(Number.NaN)).toThrow(RangeError);
  });

  it("rounds quantities to 0.5 for KG/LITER and whole units for PORTION/PIECE", () => {
    expect(roundToUnitStep("12.24", "KG").toString()).toBe("12");
    expect(roundToUnitStep("12.25", "KG").toString()).toBe("12.5");
    expect(roundToUnitStep("12.74", "LITER").toString()).toBe("12.5");
    expect(roundToUnitStep("12.75", "LITER").toString()).toBe("13");

    expect(roundToUnitStep("12.4", "PORTION").toString()).toBe("12");
    expect(roundToUnitStep("12.5", "PORTION").toString()).toBe("13");
    expect(roundToUnitStep("7.6", "PIECE").toString()).toBe("8");
    expect(roundToUnitStep("-3", "KG").toString()).toBe("0");
  });

  it("prefers tenant-specific EventCalendar entries over global ones", () => {
    const events = [
      {
        tenantId: null,
        name: "Global Ramadan",
        startDate: "2026-03-01",
        endDate: "2026-03-30",
        demandMultiplier: "1.30",
      },
      {
        tenantId: "tenant-1",
        name: "Local Catering Surge",
        startDate: "2026-03-10",
        endDate: "2026-03-20",
        demandMultiplier: "1.65",
      },
    ];

    const tenantMatch = resolveEventMultiplier("2026-03-15", events, "tenant-1");
    expect(tenantMatch.scope).toBe("TENANT");
    expect(tenantMatch.multiplier.toString()).toBe("1.65");
    expect(tenantMatch.eventName).toBe("Local Catering Surge");

    const globalMatch = resolveEventMultiplier("2026-03-15", events, "tenant-2");
    expect(globalMatch.scope).toBe("GLOBAL");
    expect(globalMatch.multiplier.toString()).toBe("1.3");

    const otherTenantOnly = resolveEventMultiplier(
      "2026-03-15",
      [events[1]!],
      "tenant-2",
    );
    expect(otherTenantOnly.scope).toBe("NONE");
    expect(otherTenantOnly.multiplier.toString()).toBe("1");

    const overlapping = resolveEventMultiplier(
      "2026-03-15",
      [
        {
          tenantId: null,
          name: "Month Event",
          startDate: new Date("2026-03-01T00:00:00.000Z"),
          endDate: new Date("2026-03-30T00:00:00.000Z"),
          demandMultiplier: "1.20",
        },
        {
          tenantId: null,
          name: "Peak Week Lower",
          startDate: "2026-03-14",
          endDate: "2026-03-16",
          demandMultiplier: "1.40",
        },
        {
          tenantId: null,
          name: "Peak Week Higher",
          startDate: "2026-03-14",
          endDate: "2026-03-16",
          demandMultiplier: "1.55",
        },
      ],
      "tenant-2",
    );
    expect(overlapping.scope).toBe("GLOBAL");
    expect(overlapping.eventName).toBe("Peak Week Higher");
    expect(overlapping.multiplier.toString()).toBe("1.55");
  });

  it("computes WAPE accuracy per item and overall while ignoring unmatched dates", () => {
    const score = scoreForecasts(
      [
        { menuItemId: "item-a", forDate: "2026-11-10", meanQty: "100" },
        { menuItemId: "item-a", forDate: "2026-11-11", meanQty: "100" },
        { menuItemId: "item-a", forDate: "2026-11-15", meanQty: "150" }, // no actual
        { menuItemId: "item-b", forDate: "2026-11-10", meanQty: "20" },
        { menuItemId: "item-zero", forDate: "2026-11-10", meanQty: "0" },
      ],
      [
        { menuItemId: "item-a", date: "2026-11-10", quantitySold: "110" }, // err 10
        { menuItemId: "item-a", date: "2026-11-11", quantitySold: "90" }, // err 10
        {
          menuItemId: "item-b",
          date: "2026-11-10",
          quantitySold: "50",
          salesUnitFactor: "0.5", // canonical = 25, err = 5
        },
        { menuItemId: "item-zero", date: "2026-11-10", quantitySold: "0" },
      ],
    );

    expect(score.totalMatchedPairs).toBe(4);
    expect(score.byItemId["item-a"]).toMatchObject({
      matchedDays: 2,
      totalActualQty: "200",
      totalAbsError: "20",
      wape: "0.1",
      wapePct: "10",
      mae: "10",
    });
    expect(score.byItemId["item-b"]).toMatchObject({
      matchedDays: 1,
      totalActualQty: "25",
      totalAbsError: "5",
      wape: "0.2",
      wapePct: "20",
    });
    expect(score.byItemId["item-zero"]?.wape).toBe("0");
    // Overall: absErr = 25, actual = 225 => 25 / 225 = 0.1111 (11.1%)
    expect(score.overallWape).toBe("0.1111");
    expect(score.overallWapePct).toBe("11.1");
  });
});
