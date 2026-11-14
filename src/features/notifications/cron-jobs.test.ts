import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as cronDailyPost } from "@/app/api/cron/daily/route";
import { POST as cronMonthlyPost } from "@/app/api/cron/monthly/route";
import { POST as cronWeeklyPost } from "@/app/api/cron/weekly/route";
import { evaluateMiddlewareDecision } from "@/lib/authz";
import { createTenantDb, platformAdminDb } from "@/lib/tenant";
import { runForecastsForTenant } from "@/features/forecast";
import { runInsightsForTenant } from "@/features/insights";
import { getMonthlyReportForTenant } from "@/features/reports";
import {
  deliverCriticalAlertsForTenant,
  getNotificationPreferencesForUser,
  loadTenantManagerRecipients,
  runDailyCronJob,
  runMonthlyCronJob,
  runWeeklyCronJob,
  updateNotificationPreferencesForUser,
} from "./index";

describe("notification delivery, alert dedupe, preferences, and cron jobs", () => {
  const createdAlertIds: string[] = [];
  const createdAuditLogIds: string[] = [];
  const preferenceCleanup: Array<{
    userId: string;
    previous: {
      criticalAlerts: boolean;
      weeklySummary: boolean;
      monthlyReport: boolean;
    } | null;
  }> = [];

  afterEach(async () => {
    if (createdAlertIds.length > 0) {
      await platformAdminDb.alert.deleteMany({
        where: { id: { in: createdAlertIds.splice(0) } },
      });
    }
    if (createdAuditLogIds.length > 0) {
      await platformAdminDb.auditLog.deleteMany({
        where: { id: { in: createdAuditLogIds.splice(0) } },
      });
    }
    for (const item of preferenceCleanup.splice(0)) {
      if (item.previous) {
        await platformAdminDb.notificationPreference.updateMany({
          where: { userId: item.userId },
          data: item.previous,
        });
      } else {
        await platformAdminDb.notificationPreference.deleteMany({
          where: { userId: item.userId },
        });
      }
    }
  });

  it("delivers critical alert emails at most once per dedupeKey and respects notifiedAt after upsert", async () => {
    const shamiJed = await platformAdminDb.restaurant.findUniqueOrThrow({
      where: { code: "SHAMI-JED" },
      select: { id: true, code: true, name: true, nameAr: true, timezone: true },
    });

    const db = createTenantDb(shamiJed.id);
    const dedupeKey = `TEST_CRITICAL_DEDUPE:${randomUUID()}`;
    const alert = await db.alert.create({
      data: {
        tenantId: shamiJed.id,
        type: "WASTE_SPIKE",
        severity: "CRITICAL",
        messageKey: "insights.alerts.wasteSpike",
        messageParams: {
          itemName: "Basmati Rice",
          itemNameAr: "أرز بسمتي",
          observedSar: "410.00",
          baselineSar: "65.00",
          pctChange: "530%",
        },
        dedupeKey,
      },
    });
    createdAlertIds.push(alert.id);

    const mockSendEmail = vi.fn(async () => ({
      ok: true as const,
      mode: "console" as const,
      id: "dev-mock-1",
    }));

    const now = new Date("2026-11-12T22:00:00.000Z");
    const first = await deliverCriticalAlertsForTenant(
      shamiJed,
      now,
      mockSendEmail,
    );
    expect(first.alertsNotified).toBeGreaterThanOrEqual(1);
    expect(first.emailsSent).toBeGreaterThanOrEqual(1);
    const firstCalls = mockSendEmail.mock.calls.length;
    expect(firstCalls).toBe(first.emailsSent);

    const stamped = await db.alert.findFirstOrThrow({
      where: { id: alert.id },
      select: { notifiedAt: true },
    });
    expect(stamped.notifiedAt).not.toBeNull();

    // Simulate insights re-running upsert on the same dedupeKey without touching notifiedAt
    await db.alert.upsert({
      where: {
        tenantId_dedupeKey: {
          tenantId: shamiJed.id,
          dedupeKey,
        },
      },
      create: {
        tenantId: shamiJed.id,
        type: "WASTE_SPIKE",
        severity: "CRITICAL",
        messageKey: "insights.alerts.wasteSpike",
        messageParams: {},
        dedupeKey,
      },
      update: {
        severity: "CRITICAL",
        messageParams: {
          itemName: "Basmati Rice",
          itemNameAr: "أرز بسمتي",
          observedSar: "415.00",
          baselineSar: "65.00",
          pctChange: "538%",
        },
      },
    });

    const second = await deliverCriticalAlertsForTenant(
      shamiJed,
      now,
      mockSendEmail,
    );
    expect(second).toEqual({ alertsNotified: 0, emailsSent: 0 });
    expect(mockSendEmail).toHaveBeenCalledTimes(firstCalls);
  });

  it("persists per-manager notification preferences and filters recipients accordingly", async () => {
    const shamiJed = await platformAdminDb.restaurant.findUniqueOrThrow({
      where: { code: "SHAMI-JED" },
      select: { id: true },
    });
    const manager = await platformAdminDb.user.findFirstOrThrow({
      where: {
        tenantId: shamiJed.id,
        role: { in: ["MANAGER", "OWNER"] },
        active: true,
        email: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, locale: true },
    });

    const existingPref = await platformAdminDb.notificationPreference.findUnique({
      where: { userId: manager.id },
      select: {
        criticalAlerts: true,
        weeklySummary: true,
        monthlyReport: true,
      },
    });
    preferenceCleanup.push({ userId: manager.id, previous: existingPref });

    const beforeAuditTime = new Date();
    const session = {
      userId: manager.id,
      tenantId: shamiJed.id,
      role: manager.role,
      locale: manager.locale,
    };

    const initial = await getNotificationPreferencesForUser(session);
    expect(initial.email).toBeTruthy();

    await updateNotificationPreferencesForUser(session, {
      criticalAlerts: false,
      weeklySummary: true,
      monthlyReport: true,
    });

    const refreshed = await getNotificationPreferencesForUser(session);
    expect(refreshed.preferences).toEqual({
      criticalAlerts: false,
      weeklySummary: true,
      monthlyReport: true,
    });

    const criticalRecipients = await loadTenantManagerRecipients(
      shamiJed.id,
      "criticalAlerts",
    );
    const weeklyRecipients = await loadTenantManagerRecipients(
      shamiJed.id,
      "weeklySummary",
    );

    expect(criticalRecipients.some((r) => r.userId === manager.id)).toBe(false);
    expect(weeklyRecipients.some((r) => r.userId === manager.id)).toBe(true);

    const prefAudits = await platformAdminDb.auditLog.findMany({
      where: {
        tenantId: shamiJed.id,
        action: "NOTIFICATION_PREFERENCES_UPDATED",
        createdAt: { gte: beforeAuditTime },
      },
      select: { id: true },
    });
    expect(prefAudits.length).toBeGreaterThanOrEqual(1);
    for (const row of prefAudits) createdAuditLogIds.push(row.id);
  });

  it("isolates one-tenant failures and writes AuditLog summaries across daily, weekly, and monthly jobs", async () => {
    const restaurants = await platformAdminDb.restaurant.findMany({
      where: { code: { in: ["SHAMI-JED", "DIWAN-MKH"] } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, nameAr: true, timezone: true },
    });
    expect(restaurants).toHaveLength(2);

    const diwan = restaurants.find((r) => r.code === "DIWAN-MKH")!;
    const shami = restaurants.find((r) => r.code === "SHAMI-JED")!;
    const tenantsPair = [shami, diwan];
    const startedAt = new Date();
    const evalNow = new Date("2026-11-12T22:00:00.000Z");

    const mockSendEmail = vi.fn(async () => ({
      ok: true as const,
      mode: "console" as const,
      id: "dev-mock-iso",
    }));

    const dailySummary = await runDailyCronJob(evalNow, {
      listRestaurants: async () => tenantsPair,
      runInsights: async (tenantId, targetNow) => {
        if (tenantId === shami.id) {
          throw new Error("Simulated SHAMI insights outage");
        }
        return runInsightsForTenant(tenantId, targetNow);
      },
      runForecasts: async (tenantId, targetNow, forecaster) =>
        runForecastsForTenant(tenantId, targetNow, forecaster),
      sendEmailFn: mockSendEmail,
    });

    expect(dailySummary.tenantsFailed).toBe(1);
    expect(dailySummary.tenantsSucceeded).toBe(1);
    expect(dailySummary.tenants.find((t) => t.tenantCode === "SHAMI-JED")?.status).toBe("FAILED");
    expect(dailySummary.tenants.find((t) => t.tenantCode === "DIWAN-MKH")?.status).toBe("OK");

    const monthlySummary = await runMonthlyCronJob(evalNow, "2026-10", {
      listRestaurants: async () => tenantsPair,
      getMonthlyReport: async (actorSession, yearMonth, options) => {
        if (actorSession.tenantId === shami.id) {
          throw new Error("Simulated monthly report failure");
        }
        return getMonthlyReportForTenant(actorSession, yearMonth, options);
      },
      sendEmailFn: mockSendEmail,
    });

    expect(monthlySummary.tenantsFailed).toBe(1);
    expect(monthlySummary.tenantsSucceeded).toBe(1);
    expect(monthlySummary.totalEmailsSent).toBeGreaterThanOrEqual(1);

    const weeklySummary = await runWeeklyCronJob(evalNow, {
      listRestaurants: async () => [diwan],
      sendEmailFn: mockSendEmail,
    });
    expect(weeklySummary.tenantsSucceeded).toBe(1);

    const logs = await platformAdminDb.auditLog.findMany({
      where: {
        entity: "CronJob",
        createdAt: { gte: startedAt },
      },
      select: { id: true, action: true },
    });
    for (const l of logs) createdAuditLogIds.push(l.id);
    const actions = new Set(logs.map((l) => l.action));
    expect(actions.has("CRON_DAILY_COMPLETED")).toBe(true);
    expect(actions.has("CRON_MONTHLY_COMPLETED")).toBe(true);
    expect(actions.has("CRON_WEEKLY_COMPLETED")).toBe(true);
  });

  it("enforces x-cron-secret across daily, weekly, and monthly POST routes and exempts middleware auth", async () => {
    for (const path of [
      "/api/cron/daily",
      "/api/cron/weekly",
      "/api/cron/monthly",
    ]) {
      expect(evaluateMiddlewareDecision(path, null)).toEqual({ type: "next" });
    }

    const prevSecret = process.env.CRON_SECRET;
    const runtimeSecret = randomUUID();
    process.env.CRON_SECRET = runtimeSecret;

    try {
      for (const handler of [cronDailyPost, cronWeeklyPost, cronMonthlyPost]) {
        const res = await handler(
          new Request("http://localhost:3000/api/cron/test", { method: "POST" }),
        );
        expect(res.status).toBe(401);
      }

      const badMonthly = await cronMonthlyPost(
        new Request("http://localhost:3000/api/cron/monthly", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": runtimeSecret,
          },
          body: JSON.stringify({ yearMonth: "2026-13" }),
        }),
      );
      expect(badMonthly.status).toBe(400);
    } finally {
      process.env.CRON_SECRET = prevSecret;
    }
  });
});
