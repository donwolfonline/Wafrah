import { describe, expect, it } from "vitest";
import {
  aggregateTenantWape,
  buildDailyWasteSeries,
  buildRestaurantCodeCandidate,
  deriveManagerUsername,
  generateTemporaryPassword,
  resolveCityCode,
  summarizeCronJobLogs,
} from "./index";
import {
  createRestaurantSchema,
  suspendRestaurantSchema,
  updateSubscriptionSchema,
} from "./schemas";

describe("admin pure domain logic", () => {
  it("builds deterministic unique restaurant code candidates across Saudi cities", () => {
    expect(resolveCityCode("Riyadh")).toBe("RYD");
    expect(resolveCityCode("Jeddah")).toBe("JED");
    expect(resolveCityCode("Makkah")).toBe("MKH");
    expect(resolveCityCode("Dammam")).toBe("DMM");
    expect(resolveCityCode("Jubail")).toBe("JUB");

    expect(buildRestaurantCodeCandidate("Al Najd Kitchen", "Riyadh", 0)).toBe(
      "NAJD-RYD",
    );
    expect(buildRestaurantCodeCandidate("Al Najd Kitchen", "Riyadh", 2)).toBe(
      "NAJD-RYD-02",
    );
    expect(buildRestaurantCodeCandidate("مطبخ النخبة", "Jeddah", 0)).toBe(
      "WAF-JED",
    );
  });

  it("generates strong one-time temporary passwords and manager usernames", () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const pw = generateTemporaryPassword(14);
      expect(pw).toHaveLength(14);
      expect(/[A-Z]/.test(pw)).toBe(true);
      expect(/[a-z]/.test(pw)).toBe(true);
      expect(/[2-9]/.test(pw)).toBe(true);
      expect(/[!@#$%]/.test(pw)).toBe(true);
      expect(/[0OIl1]/.test(pw)).toBe(false);
      passwords.add(pw);
    }
    expect(passwords.size).toBe(10);

    expect(deriveManagerUsername("Khalid.AlOtaibi@najd.sa")).toBe(
      "khalid.alotaibi",
    );
    expect(deriveManagerUsername("!@sa.com")).toBe("manager");
  });

  it("builds a complete 14-day platform waste series with zero-fill", () => {
    const { windowStartDateKey, windowEndDateKey, points } =
      buildDailyWasteSeries(
        "2026-11-13",
        [
          { dateKey: "2026-10-31", entryCount: 12, tenantCount: 2 },
          { dateKey: "2026-11-12", entryCount: 45, tenantCount: 3 },
        ],
        14,
      );

    expect(windowStartDateKey).toBe("2026-10-31");
    expect(windowEndDateKey).toBe("2026-11-13");
    expect(points).toHaveLength(14);
    expect(points[0]).toEqual({
      dateKey: "2026-10-31",
      entryCount: 12,
      tenantCount: 2,
    });
    expect(points[12]).toEqual({
      dateKey: "2026-11-12",
      entryCount: 45,
      tenantCount: 3,
    });
    expect(points[13]).toEqual({
      dateKey: "2026-11-13",
      entryCount: 0,
      tenantCount: 0,
    });
  });

  it("computes average WAPE per tenant and flags only tenants strictly above 40%", () => {
    const tenants = [
      { id: "t-ok", code: "OK-RYD", name: "Ok Kitchen", nameAr: "مطبخ جيد" },
      { id: "t-edge", code: "EDGE-RYD", name: "Edge", nameAr: "حدي" },
      { id: "t-high", code: "HIGH-JED", name: "High", nameAr: "مرتفع" },
      { id: "t-none", code: "NEW-DMM", name: "New", nameAr: "جديد" },
    ];

    const summary = aggregateTenantWape(tenants, [
      {
        tenantId: "t-ok",
        createdAt: new Date("2026-11-10T00:00:00Z"),
        metadata: { overallWapePct: 18.4 },
      },
      {
        tenantId: "t-ok",
        createdAt: new Date("2026-11-11T00:00:00Z"),
        metadata: { overallWapePct: 22.0 },
      },
      {
        tenantId: "t-edge",
        createdAt: new Date("2026-11-11T00:00:00Z"),
        metadata: { overallWape: 0.4 },
      },
      {
        tenantId: "t-high",
        createdAt: new Date("2026-11-10T00:00:00Z"),
        metadata: { overallWapePct: 38.0 },
      },
      {
        tenantId: "t-high",
        createdAt: new Date("2026-11-12T00:00:00Z"),
        metadata: { overallWapePct: 44.5 },
      },
    ]);

    expect(summary[0]?.code).toBe("HIGH-JED");
    expect(summary[0]?.averageWapePct).toBe(41.3);
    expect(summary[0]?.flaggedHighWape).toBe(true);

    const edge = summary.find((s) => s.code === "EDGE-RYD");
    expect(edge?.averageWapePct).toBe(40);
    expect(edge?.flaggedHighWape).toBe(false);

    const ok = summary.find((s) => s.code === "OK-RYD");
    expect(ok?.averageWapePct).toBe(20.2);
    expect(ok?.flaggedHighWape).toBe(false);

    const none = summary.find((s) => s.code === "NEW-DMM");
    expect(none?.averageWapePct).toBeNull();
    expect(none?.flaggedHighWape).toBe(false);
  });

  it("summarizes cron job AuditLog status accurately", () => {
    const summary = summarizeCronJobLogs({
      CRON_DAILY_COMPLETED: {
        action: "CRON_DAILY_COMPLETED",
        createdAt: new Date("2026-11-13T00:00:00.000Z"),
        metadata: {
          tenantCount: 3,
          tenantsSucceeded: 2,
          tenantsFailed: 1,
          totalEmailsSent: 4,
        },
      },
      CRON_WEEKLY_COMPLETED: {
        action: "CRON_WEEKLY_COMPLETED",
        createdAt: new Date("2026-11-12T00:00:00.000Z"),
        metadata: {
          tenantCount: 2,
          tenantsSucceeded: 0,
          tenantsFailed: 2,
          totalEmailsSent: 0,
        },
      },
      CRON_MONTHLY_COMPLETED: null,
      FORECAST_RUN_COMPLETED: {
        action: "FORECAST_RUN_COMPLETED",
        createdAt: new Date("2026-11-13T01:00:00.000Z"),
        metadata: { overallWapePct: 19.2 },
      },
    });

    expect(summary).toEqual([
      {
        job: "daily",
        lastRunAt: "2026-11-13T00:00:00.000Z",
        status: "PARTIAL",
        tenantCount: 3,
        tenantsSucceeded: 2,
        tenantsFailed: 1,
        totalEmailsSent: 4,
      },
      {
        job: "weekly",
        lastRunAt: "2026-11-12T00:00:00.000Z",
        status: "FAILED",
        tenantCount: 2,
        tenantsSucceeded: 0,
        tenantsFailed: 2,
        totalEmailsSent: 0,
      },
      {
        job: "monthly",
        lastRunAt: null,
        status: "NEVER_RUN",
        tenantCount: null,
        tenantsSucceeded: null,
        tenantsFailed: null,
        totalEmailsSent: null,
      },
      {
        job: "forecast",
        lastRunAt: "2026-11-13T01:00:00.000Z",
        status: "OK",
        tenantCount: null,
        tenantsSucceeded: null,
        tenantsFailed: null,
        totalEmailsSent: null,
      },
    ]);
  });

  it("validates admin Zod schemas cleanly", () => {
    const validCreate = createRestaurantSchema.parse({
      name: "  Najd House ",
      nameAr: " بيت نجد ",
      city: " Riyadh ",
      type: "Casual Dining",
      plan: "MEDIUM",
      managerName: "Tariq",
      managerEmail: "TARIQ@NAJD.SA ",
    });
    expect(validCreate.managerEmail).toBe("tariq@najd.sa");
    expect(validCreate.managerLocale).toBe("ar");

    expect(
      updateSubscriptionSchema.safeParse({
        plan: "CHAIN",
        status: "SUSPENDED",
        renewsAt: "2027-01-01",
      }).success,
    ).toBe(true);
    expect(
      updateSubscriptionSchema.safeParse({
        plan: "CHAIN",
        status: "ACTIVE",
        renewsAt: "not-a-date",
      }).success,
    ).toBe(false);
    expect(suspendRestaurantSchema.safeParse({ action: "suspend" }).success).toBe(
      true,
    );
  });
});
