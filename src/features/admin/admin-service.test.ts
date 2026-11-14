import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateManager,
  authenticateStaffPin,
} from "@/features/auth/authorize";
import type { SessionUser } from "@/lib/authz";
import { hashSecret } from "@/lib/password";
import { platformAdminDb } from "@/lib/tenant";
import {
  createAdminRestaurant,
  getAdminOverview,
  getTenantDiagnostics,
  setRestaurantSuspension,
  updateAdminSubscription,
} from "./index";

describe("admin console Postgres integration, audit logging, and suspension enforcement", () => {
  const createdRestaurantIds: string[] = [];
  const createdAuditLogIds: string[] = [];

  afterEach(async () => {
    if (createdAuditLogIds.length > 0) {
      await platformAdminDb.auditLog.deleteMany({
        where: { id: { in: createdAuditLogIds.splice(0) } },
      });
    }
    if (createdRestaurantIds.length > 0) {
      const ids = createdRestaurantIds.splice(0);
      await platformAdminDb.auditLog.deleteMany({
        where: { tenantId: { in: ids } },
      });
      await platformAdminDb.restaurant.deleteMany({
        where: { id: { in: ids } },
      });
    }
  });

  async function getAdminActor(): Promise<SessionUser> {
    const admin = await platformAdminDb.user.findUniqueOrThrow({
      where: { email: "admin@wafrah.sa" },
      select: { id: true, name: true, role: true, tenantId: true, locale: true },
    });
    return {
      userId: admin.id,
      name: admin.name,
      role: admin.role,
      tenantId: admin.tenantId,
      locale: admin.locale,
    };
  }

  it("creates restaurant + manager with one-time password, welcome email, audit logs, and login enforcement across suspend/reactivate", async () => {
    const adminActor = await getAdminActor();
    const uniqueToken = randomUUID().slice(0, 6).toUpperCase();
    const managerEmail = `mgr.${uniqueToken.toLowerCase()}@test-wafrah.sa`;

    const sendWelcomeSpy = vi.fn(async () => ({
      ok: true,
      mode: "console" as const,
      id: "test-email-id",
    }));

    const created = await createAdminRestaurant(
      adminActor,
      {
        name: `Test Oasis ${uniqueToken}`,
        nameAr: `مطعم الواحة ${uniqueToken}`,
        city: "Riyadh",
        type: "Hotel Banquet",
        plan: "MEDIUM",
        managerName: "Fahad Al-Harbi",
        managerEmail,
        managerLocale: "en",
      },
      { sendWelcomeFn: sendWelcomeSpy },
    );

    createdRestaurantIds.push(created.customer.id);

    expect(created.customer.code).toContain("-RYD");
    expect(created.customer.plan).toBe("MEDIUM");
    expect(created.customer.status).toBe("ACTIVE");
    expect(created.manager.email).toBe(managerEmail);
    expect(created.manager.role).toBe("MANAGER");
    expect(created.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(created.welcomeEmailStatus).toBe("sent");
    expect(sendWelcomeSpy).toHaveBeenCalledTimes(1);
    expect(sendWelcomeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        email: managerEmail,
        branchCode: created.customer.code,
        locale: "en",
        role: "MANAGER",
      }),
    );

    // Verify new manager can sign in immediately with the generated temporary password
    const initialLogin = await authenticateManager({
      email: managerEmail,
      password: created.temporaryPassword,
    });
    expect(initialLogin.ok).toBe(true);

    // Add a staff user to verify both manager and staff PIN logins obey suspension
    const staffUser = await platformAdminDb.user.create({
      data: {
        tenantId: created.customer.id,
        name: "Yousef Kitchen",
        role: "STAFF",
        username: "yousef",
        pinHash: hashSecret("2468"),
        locale: "ar",
        active: true,
      },
    });

    // Update plan/status/renewsAt manually
    const updatedSub = await updateAdminSubscription(
      adminActor,
      created.customer.id,
      {
        plan: "CHAIN",
        status: "TRIAL",
        renewsAt: "2027-06-15",
      },
    );
    expect(updatedSub.plan).toBe("CHAIN");
    expect(updatedSub.status).toBe("TRIAL");
    expect(updatedSub.renewsAt?.slice(0, 10)).toBe("2027-06-15");

    // Suspend tenant and prove manager + staff logins are rejected cleanly
    const suspended = await setRestaurantSuspension(
      adminActor,
      created.customer.id,
      { action: "suspend" },
    );
    expect(suspended.status).toBe("SUSPENDED");

    const blockedManagerLogin = await authenticateManager({
      email: managerEmail,
      password: created.temporaryPassword,
    });
    expect(blockedManagerLogin).toEqual({
      ok: false,
      code: "TENANT_SUSPENDED",
    });

    const blockedStaffLogin = await authenticateStaffPin({
      restaurantCode: created.customer.code,
      username: staffUser.username!,
      pin: "2468",
    });
    expect(blockedStaffLogin).toEqual({
      ok: false,
      code: "TENANT_SUSPENDED",
    });

    // Wrong password should NOT reveal suspension
    const wrongPwLogin = await authenticateManager({
      email: managerEmail,
      password: "WrongPassword!999",
    });
    expect(wrongPwLogin).toEqual({
      ok: false,
      code: "INVALID_CREDENTIALS",
    });

    // Reactivate tenant and verify login works again
    const reactivated = await setRestaurantSuspension(
      adminActor,
      created.customer.id,
      { action: "reactivate" },
    );
    expect(reactivated.status).toBe("ACTIVE");

    const restoredManagerLogin = await authenticateManager({
      email: managerEmail,
      password: created.temporaryPassword,
    });
    expect(restoredManagerLogin.ok).toBe(true);

    const restoredStaffLogin = await authenticateStaffPin({
      restaurantCode: created.customer.code,
      username: staffUser.username!,
      pin: "2468",
    });
    expect(restoredStaffLogin.ok).toBe(true);

    // Read-only support diagnostics
    const diagnostics = await getTenantDiagnostics(
      adminActor,
      created.customer.id,
    );
    expect(diagnostics.tenant.code).toBe(created.customer.code);
    expect(diagnostics.counts.usersTotal).toBe(2);
    expect(diagnostics.counts.wasteEntriesCount).toBe(0);
    expect(diagnostics.lastImports).toEqual([]);
    expect(diagnostics.lastAlerts).toEqual([]);

    // Record high-WAPE (> 40%) evaluation and confirm Health overview flags it
    const highWapeAudit = await platformAdminDb.auditLog.create({
      data: {
        tenantId: created.customer.id,
        action: "FORECAST_RUN_COMPLETED",
        entity: "ForecastAccuracy",
        entityId: created.customer.id,
        metadata: {
          overallWape: 0.482,
          overallWapePct: 48.2,
          totalMatchedPairs: 14,
        },
      },
    });
    createdAuditLogIds.push(highWapeAudit.id);

    const overview = await getAdminOverview(adminActor);
    const overviewRow = overview.customers.find(
      (c) => c.id === created.customer.id,
    );
    expect(overviewRow?.userCount).toBe(2);
    expect(overviewRow?.status).toBe("ACTIVE");

    const wapeRow = overview.health.forecastAccuracy.find(
      (w) => w.tenantId === created.customer.id,
    );
    expect(wapeRow?.averageWapePct).toBe(48.2);
    expect(wapeRow?.flaggedHighWape).toBe(true);
    expect(overview.health.flaggedWapeCount).toBeGreaterThanOrEqual(1);
    expect(overview.health.dailyEntries).toHaveLength(14);

    // Confirm every admin action wrote an AuditLog without storing plaintext password
    const auditLogs = await platformAdminDb.auditLog.findMany({
      where: { tenantId: created.customer.id },
      orderBy: { createdAt: "asc" },
    });
    const actions = auditLogs.map((l) => l.action);
    expect(actions).toContain("ADMIN_RESTAURANT_CREATED");
    expect(actions).toContain("ADMIN_SUBSCRIPTION_UPDATED");
    expect(actions).toContain("ADMIN_RESTAURANT_SUSPENDED");
    expect(actions).toContain("ADMIN_RESTAURANT_REACTIVATED");
    expect(actions).toContain("ADMIN_DIAGNOSTICS_VIEWED");

    for (const log of auditLogs) {
      expect(JSON.stringify(log.metadata)).not.toContain(
        created.temporaryPassword,
      );
    }
  });
});
