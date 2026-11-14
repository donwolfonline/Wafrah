import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runForecastsForTenant } from "@/features/forecast";
import { runInsightsForTenant } from "@/features/insights";
import { AuthorizationError, type SessionUser } from "@/lib/authz";
import { createTenantDb, platformAdminDb } from "@/lib/tenant";
import {
  DashboardNotFoundError,
  getDashboardDataForTenant,
  updateDashboardAlertStatus,
} from "./index";

describe("dashboard server aggregation, RBAC, and tenant isolation", () => {
  it("loads SQL-aggregated metrics, alerts, and 7-day forecasts for seeded SHAMI-JED under 2s", async () => {
    const shamiJed = await platformAdminDb.restaurant.findUniqueOrThrow({
      where: { code: "SHAMI-JED" },
      select: { id: true },
    });
    const manager = await platformAdminDb.user.findFirstOrThrow({
      where: {
        tenantId: shamiJed.id,
        role: { in: ["MANAGER", "OWNER"] },
      },
      select: { id: true, tenantId: true, role: true, locale: true },
    });

    await runInsightsForTenant(
      shamiJed.id,
      new Date("2026-11-12T20:00:00.000Z"),
    );
    await runForecastsForTenant(
      shamiJed.id,
      new Date("2026-11-13T11:00:00.000Z"),
    );

    const sessionUser: SessionUser = {
      userId: manager.id,
      tenantId: manager.tenantId,
      role: manager.role,
      locale: manager.locale,
    };

    const evalNow = new Date("2026-11-13T12:00:00.000Z"); // 15:00 Asia/Riyadh
    const data30 = await getDashboardDataForTenant(sessionUser, {
      rangeDays: 30,
      now: evalNow,
    });

    expect(data30.rangeDays).toBe(30);
    expect(data30.serverLoadMs).toBeLessThan(2000);
    expect(data30.checklist.isNewRestaurantEmpty).toBe(false);
    expect(Number(data30.kpis.totalWasteSar)).toBeGreaterThan(0);
    expect(data30.kpis.wasteEntryCount).toBeGreaterThan(0);
    expect(data30.kpis.hasPurchaseData).toBe(true);
    expect(data30.kpis.wasteAsPctOfPurchases).not.toBeNull();
    expect(data30.kpis.topReason).not.toBeNull();
    expect(data30.dailyTrend).toHaveLength(30);
    expect(data30.dailyTrend[data30.dailyTrend.length - 1]?.dateKey).toBe(
      "2026-11-13",
    );
    expect(data30.itemBars.length).toBeGreaterThan(0);
    expect(data30.itemBars.length).toBeLessThanOrEqual(8);
    expect(data30.heatmap.cells).toHaveLength(21);
    expect(data30.reasons.length).toBeGreaterThan(0);
    expect(
      data30.alerts.some((a) => a.messageKey === "insights.alerts.wasteSpike"),
    ).toBe(true);
    expect(data30.recommendations.horizonDates).toHaveLength(7);
    expect(data30.recommendations.items).toHaveLength(8);
    expect(
      data30.recommendations.items.every((item) => item.status === "OK"),
    ).toBe(true);
    expect(data30.recommendations.items[0]?.days[0]?.why.weekdayMean).not.toBeNull();

    const data7 = await getDashboardDataForTenant(sessionUser, {
      rangeDays: 7,
      now: evalNow,
    });
    const data90 = await getDashboardDataForTenant(sessionUser, {
      rangeDays: 90,
      now: evalNow,
    });
    expect(data7.dailyTrend).toHaveLength(7);
    expect(data90.dailyTrend).toHaveLength(90);
    expect(data7.kpis.wasteEntryCount).toBeLessThanOrEqual(
      data30.kpis.wasteEntryCount,
    );
    expect(data30.kpis.wasteEntryCount).toBeLessThanOrEqual(
      data90.kpis.wasteEntryCount,
    );
  });

  it("shows onboarding checklist for empty restaurants and enforces cross-tenant/RBAC alert guards", async () => {
    const shamiJed = await platformAdminDb.restaurant.findUniqueOrThrow({
      where: { code: "SHAMI-JED" },
      select: { id: true },
    });
    const shamiDb = createTenantDb(shamiJed.id);
    const shamiAlert = await shamiDb.alert.findFirstOrThrow({
      where: { status: { not: "DISMISSED" } },
      select: { id: true, status: true },
    });
    const shamiManager = await platformAdminDb.user.findFirstOrThrow({
      where: {
        tenantId: shamiJed.id,
        role: { in: ["MANAGER", "OWNER"] },
      },
      select: { id: true, locale: true },
    });
    const shamiStaff = await platformAdminDb.user.findFirstOrThrow({
      where: { tenantId: shamiJed.id, role: "STAFF" },
      select: { id: true, locale: true },
    });

    await platformAdminDb.user.deleteMany({
      where: { tenant: { code: { startsWith: "DASH-EMPTY-" } } },
    });
    await platformAdminDb.restaurant.deleteMany({
      where: { code: { startsWith: "DASH-EMPTY-" } },
    });

    const emptyCode = `DASH-EMPTY-${randomUUID().slice(0, 8)}`;
    const emptyTenant = await platformAdminDb.restaurant.create({
      data: {
        code: emptyCode,
        name: "Empty Grill",
        nameAr: "مطعم جديد",
        city: "Riyadh",
        type: "Casual",
        timezone: "Asia/Riyadh",
      },
      select: { id: true },
    });

    try {
      const emptyManager = await platformAdminDb.user.create({
        data: {
          tenantId: emptyTenant.id,
          name: "Empty Manager",
          role: "MANAGER",
          email: `${emptyCode.toLowerCase()}@example.sa`,
          username: emptyCode.toLowerCase(),
          locale: "ar",
          active: true,
        },
        select: { id: true, locale: true },
      });
      const emptySession: SessionUser = {
        userId: emptyManager.id,
        tenantId: emptyTenant.id,
        role: "MANAGER",
        locale: emptyManager.locale,
      };
      const emptyDashboard = await getDashboardDataForTenant(emptySession, {
        rangeDays: 30,
        now: new Date("2026-11-13T12:00:00.000Z"),
      });

      expect(emptyDashboard.checklist.isNewRestaurantEmpty).toBe(true);
      expect(emptyDashboard.kpis.hasPurchaseData).toBe(false);
      expect(emptyDashboard.kpis.wasteEntryCount).toBe(0);
      expect(emptyDashboard.alerts).toEqual([]);
      expect(emptyDashboard.recommendations.items).toEqual([]);

      await expect(
        updateDashboardAlertStatus(emptySession, shamiAlert.id, "READ"),
      ).rejects.toThrowError(DashboardNotFoundError);

      await expect(
        updateDashboardAlertStatus(
          {
            userId: shamiStaff.id,
            tenantId: shamiJed.id,
            role: "STAFF",
            locale: shamiStaff.locale,
          },
          shamiAlert.id,
          "READ",
        ),
      ).rejects.toThrowError(AuthorizationError);

      const managerSession: SessionUser = {
        userId: shamiManager.id,
        tenantId: shamiJed.id,
        role: "MANAGER",
        locale: shamiManager.locale,
      };
      const marked = await updateDashboardAlertStatus(
        managerSession,
        shamiAlert.id,
        "READ",
      );
      expect(marked).toEqual({ id: shamiAlert.id, status: "READ" });
    } finally {
      await shamiDb.alert.update({
        where: { id: shamiAlert.id },
        data: { status: shamiAlert.status },
      });
      await shamiDb.auditLog.deleteMany({
        where: {
          entity: "Alert",
          entityId: shamiAlert.id,
          userId: shamiManager.id,
          action: "ALERT_READ",
        },
      });
      await platformAdminDb.user.deleteMany({
        where: { tenantId: emptyTenant.id },
      });
      await platformAdminDb.restaurant.delete({
        where: { id: emptyTenant.id },
      });
    }
  });
});
