import { afterEach, describe, expect, it } from "vitest";
import { AuthorizationError, type SessionUser } from "@/lib/authz";
import { platformAdminDb } from "@/lib/tenant";
import {
  getMonthlyReportForTenant,
  listReportMonthsForTenant,
  ReportsValidationError,
  updateRestaurantBaselineForTenant,
} from "./index";

const EVAL_NOW = new Date("2026-11-12T12:00:00.000Z");

describe("reports service, baseline persistence, and tenant isolation", () => {
  let restoreShamiBaseline: {
    id: string;
    baselineStart: Date | null;
    baselineEnd: Date | null;
  } | null = null;

  afterEach(async () => {
    if (restoreShamiBaseline) {
      await platformAdminDb.restaurant.update({
        where: { id: restoreShamiBaseline.id },
        data: {
          baselineStart: restoreShamiBaseline.baselineStart,
          baselineEnd: restoreShamiBaseline.baselineEnd,
        },
      });
      await platformAdminDb.auditLog.deleteMany({
        where: {
          tenantId: restoreShamiBaseline.id,
          action: "BASELINE_UPDATED",
          entity: "Restaurant",
        },
      });
      restoreShamiBaseline = null;
    }
  });

  it("computes seeded monthly reports honestly for SHAMI-JED and enforces RBAC & tenant isolation", async () => {
    const [shami, diwan] = await Promise.all([
      platformAdminDb.restaurant.findUniqueOrThrow({
        where: { code: "SHAMI-JED" },
        select: { id: true, baselineStart: true, baselineEnd: true },
      }),
      platformAdminDb.restaurant.findUniqueOrThrow({
        where: { code: "DIWAN-MKH" },
        select: { id: true },
      }),
    ]);

    const [shamiManager, shamiStaff, diwanManager, platformAdmin] =
      await Promise.all([
        platformAdminDb.user.findFirstOrThrow({
          where: { tenantId: shami.id, role: { in: ["MANAGER", "OWNER"] } },
          select: { id: true, tenantId: true, role: true, locale: true },
        }),
        platformAdminDb.user.findFirstOrThrow({
          where: { tenantId: shami.id, role: "STAFF" },
          select: { id: true, tenantId: true, role: true, locale: true },
        }),
        platformAdminDb.user.findFirstOrThrow({
          where: { tenantId: diwan.id, role: { in: ["MANAGER", "OWNER"] } },
          select: { id: true, tenantId: true, role: true, locale: true },
        }),
        platformAdminDb.user.findFirstOrThrow({
          where: { role: "PLATFORM_ADMIN" },
          select: { id: true, tenantId: true, role: true, locale: true },
        }),
      ]);

    const managerSession: SessionUser = {
      userId: shamiManager.id,
      tenantId: shamiManager.tenantId,
      role: shamiManager.role,
      locale: shamiManager.locale,
    };
    const diwanSession: SessionUser = {
      userId: diwanManager.id,
      tenantId: diwanManager.tenantId,
      role: diwanManager.role,
      locale: diwanManager.locale,
    };

    const listResult = await listReportMonthsForTenant(managerSession, {
      now: EVAL_NOW,
    });
    expect(listResult.restaurant.code).toBe("SHAMI-JED");
    expect(listResult.months.map((m) => m.yearMonth)).toEqual([
      "2026-11",
      "2026-10",
      "2026-09",
      "2026-08",
      "2026-07",
    ]);

    const augReport = await getMonthlyReportForTenant(managerSession, "2026-08", {
      now: EVAL_NOW,
    });
    expect(augReport.savings.isEstimate).toBe(true);
    expect(augReport.savings.method).toBe("VOLUME_ADJUSTED");
    expect(augReport.savings.hasSalesForBothPeriods).toBe(true);
    expect(augReport.savings.outcome).toBe("SAVED");
    expect(Number(augReport.savings.headlineAmountSar)).toBeGreaterThan(0);
    expect(augReport.topItems.length).toBeGreaterThan(0);
    expect(augReport.topItems.length).toBeLessThanOrEqual(5);
    expect(augReport.topReasons.length).toBeGreaterThan(0);
    expect(augReport.suggestedActions.length).toBe(3);

    const novReport = await getMonthlyReportForTenant(managerSession, "2026-11", {
      now: EVAL_NOW,
    });
    expect(novReport.periodEndDate).toBe("2026-11-12");
    expect(novReport.savings.outcome).toBe("INCREASED");
    expect(Number(novReport.savings.signedDeltaSar)).toBeLessThan(0);
    expect(Number(novReport.savings.headlineAmountSar)).toBeGreaterThan(0);

    // Cross-tenant isolation: Diwan report is scoped strictly to DIWAN-MKH
    const diwanAug = await getMonthlyReportForTenant(diwanSession, "2026-08", {
      now: EVAL_NOW,
    });
    expect(diwanAug.restaurant.code).toBe("DIWAN-MKH");
    expect(diwanAug.savings.baseline.totalWasteSar).not.toBe(
      augReport.savings.baseline.totalWasteSar,
    );

    // STAFF and PLATFORM_ADMIN rejected
    await expect(
      listReportMonthsForTenant({
        userId: shamiStaff.id,
        tenantId: shamiStaff.tenantId,
        role: "STAFF",
        locale: shamiStaff.locale,
      }),
    ).rejects.toThrow(AuthorizationError);

    await expect(
      getMonthlyReportForTenant(
        {
          userId: platformAdmin.id,
          tenantId: platformAdmin.tenantId,
          role: "PLATFORM_ADMIN",
          locale: platformAdmin.locale,
        },
        "2026-08",
      ),
    ).rejects.toThrow(AuthorizationError);

    // Baseline update validation + persistence + auto reset
    restoreShamiBaseline = {
      id: shami.id,
      baselineStart: shami.baselineStart,
      baselineEnd: shami.baselineEnd,
    };

    await expect(
      updateRestaurantBaselineForTenant(managerSession, {
        baselineStart: "2026-08-20",
        baselineEnd: "2026-08-10",
      }),
    ).rejects.toThrow(ReportsValidationError);

    const updated = await updateRestaurantBaselineForTenant(managerSession, {
      baselineStart: "2026-08-01",
      baselineEnd: "2026-08-14",
    });
    expect(updated).toEqual({
      baselineStart: "2026-08-01",
      baselineEnd: "2026-08-14",
    });

    const reset = await updateRestaurantBaselineForTenant(managerSession, {
      baselineStart: null,
      baselineEnd: null,
    });
    expect(reset).toEqual({ baselineStart: null, baselineEnd: null });
  });
});
