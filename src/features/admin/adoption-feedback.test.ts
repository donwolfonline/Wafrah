import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateManager,
  authenticateStaffPin,
} from "@/features/auth/authorize";
import { FeedbackServiceError, submitFeedback } from "@/features/feedback";
import { createStaffMember } from "@/features/staff";
import { AuthorizationError, type SessionUser } from "@/lib/authz";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { toTimeZoneDateKey } from "@/features/insights";
import { platformAdminDb } from "@/lib/tenant";
import { buildTenantAdoptionRows } from "./adoption-math";
import { createAdminRestaurant } from "./mutations";
import { getAdminOverview } from "./queries";

describe("admin adoption math", () => {
  it("builds 14-day entry sparklines and flags active tenants with zero entries in the last 3 days", () => {
    const endDateKey = "2026-11-14";
    const rows = buildTenantAdoptionRows(
      endDateKey,
      [
        {
          id: "t-stale",
          code: "STALE-1",
          name: "Stale Cafe",
          nameAr: "مقهى متأخر",
          status: "ACTIVE",
        },
        {
          id: "t-active",
          code: "ACTV-1",
          name: "Active Bistro",
          nameAr: "بيسترو نشط",
          status: "TRIAL",
        },
        {
          id: "t-suspended",
          code: "SUSP-1",
          name: "Suspended Diner",
          nameAr: "مطعم موقوف",
          status: "SUSPENDED",
        },
      ],
      [
        { tenantId: "t-stale", dateKey: "2026-11-05", entryCount: 4 },
        { tenantId: "t-active", dateKey: "2026-11-12", entryCount: 2 },
        { tenantId: "t-active", dateKey: "2026-11-14", entryCount: 3 },
      ],
      new Map([
        ["t-stale", new Date("2026-11-05T10:00:00Z")],
        ["t-active", new Date("2026-11-14T08:00:00Z")],
      ]),
      new Map([["t-active", new Date("2026-11-14T07:00:00Z")]]),
    );

    // Flagged active tenant is sorted first
    expect(rows.map((r) => r.tenantId)).toEqual([
      "t-stale",
      "t-suspended",
      "t-active",
    ]);

    const stale = rows.find((r) => r.tenantId === "t-stale")!;
    expect(stale.dailySeries).toHaveLength(14);
    expect(stale.dailySeries[0]?.dateKey).toBe("2026-11-01");
    expect(stale.dailySeries[13]?.dateKey).toBe("2026-11-14");
    expect(stale.entries14d).toBe(4);
    expect(stale.entriesLast3Days).toBe(0);
    expect(stale.noEntriesIn3Days).toBe(true);
    expect(stale.lastLoginAt).toBeNull();

    const active = rows.find((r) => r.tenantId === "t-active")!;
    expect(active.entries14d).toBe(5);
    expect(active.entriesLast3Days).toBe(5);
    expect(active.noEntriesIn3Days).toBe(false);
    expect(active.lastLoginAt).toBe("2026-11-14T07:00:00.000Z");

    const suspended = rows.find((r) => r.tenantId === "t-suspended")!;
    expect(suspended.entriesLast3Days).toBe(0);
    expect(suspended.noEntriesIn3Days).toBe(false);
  });
});

describe("admin adoption & feedback integration", () => {
  const createdTenantIds: string[] = [];

  afterEach(async () => {
    const ids = createdTenantIds.splice(0);
    if (ids.length === 0) {
      return;
    }
    await platformAdminDb.wasteEntry.deleteMany({
      where: { tenantId: { in: ids } },
    });
    await platformAdminDb.menuItem.deleteMany({
      where: { tenantId: { in: ids } },
    });
    await platformAdminDb.feedback.deleteMany({
      where: { tenantId: { in: ids } },
    });
    await platformAdminDb.auditLog.deleteMany({
      where: { tenantId: { in: ids } },
    });
    await platformAdminDb.restaurant.deleteMany({
      where: { id: { in: ids } },
    });
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

  it("tracks User.lastLoginAt, stores feedback scoped to caller tenant, and surfaces adoption + feedback in admin overview", async () => {
    const adminActor = await getAdminActor();
    const token = randomUUID().slice(0, 6).toLowerCase();
    const managerEmail = `adopt.${token}@test-wafrah.sa`;

    const created = await createAdminRestaurant(
      adminActor,
      {
        name: `Adoption Test ${token}`,
        nameAr: `تجربة التبني ${token}`,
        city: "Riyadh",
        type: "Cafe",
        plan: "SMALL",
        managerName: "Tariq Pilot",
        managerEmail,
        managerLocale: "en",
      },
      {
        sendWelcomeFn: vi.fn(async () => ({
          ok: true,
          mode: "console" as const,
          id: "mock-id",
        })),
      },
    );
    createdTenantIds.push(created.customer.id);

    const managerSession: SessionUser = {
      userId: created.manager.id,
      name: created.manager.name,
      role: "MANAGER",
      tenantId: created.customer.id,
      locale: "en",
    };

    const staffCreated = await createStaffMember(managerSession, {
      name: "Salem Kitchen",
      username: `salem-${token}`,
    });

    // Neither user has logged in yet
    const beforeUsers = await platformAdminDb.user.findMany({
      where: { tenantId: created.customer.id },
      select: { id: true, lastLoginAt: true },
    });
    expect(beforeUsers.every((u) => u.lastLoginAt === null)).toBe(true);

    const mgrLogin = await authenticateManager({
      email: managerEmail,
      password: created.temporaryPassword,
    });
    expect(mgrLogin.ok).toBe(true);

    const staffLogin = await authenticateStaffPin({
      restaurantCode: created.customer.code,
      username: staffCreated.staff.username,
      pin: staffCreated.generatedPin,
    });
    expect(staffLogin.ok).toBe(true);

    const afterUsers = await platformAdminDb.user.findMany({
      where: { tenantId: created.customer.id },
      select: { id: true, lastLoginAt: true },
    });
    expect(afterUsers.every((u) => u.lastLoginAt instanceof Date)).toBe(true);

    // Reject unauthenticated or out-of-range feedback
    await expect(
      submitFeedback(null, { rating: 5, message: "Hello", page: "/log" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      submitFeedback(managerSession, {
        rating: 6,
        message: "Too high",
        page: "/dashboard",
      }),
    ).rejects.toBeInstanceOf(FeedbackServiceError);

    const staffSession: SessionUser = {
      userId: staffCreated.staff.id,
      name: staffCreated.staff.name,
      role: "STAFF",
      tenantId: created.customer.id,
      locale: "ar",
    };

    await submitFeedback(staffSession, {
      rating: 4,
      message: `Fast logging on tablet ${token}`,
      page: "https://app.wafrah.sa/log?shift=MORNING",
    });
    await submitFeedback(managerSession, {
      rating: 5,
      message: `Great dashboard clarity ${token}`,
      page: "/dashboard",
    });

    const overviewBeforeWaste = await getAdminOverview(adminActor);
    const tenantAdoptionBefore = overviewBeforeWaste.adoption.find(
      (a) => a.tenantId === created.customer.id,
    );
    expect(tenantAdoptionBefore).toBeDefined();
    expect(tenantAdoptionBefore?.dailySeries).toHaveLength(14);
    expect(tenantAdoptionBefore?.entriesLast3Days).toBe(0);
    expect(tenantAdoptionBefore?.noEntriesIn3Days).toBe(true);
    expect(tenantAdoptionBefore?.lastLoginAt).not.toBeNull();

    const tenantFeedback = overviewBeforeWaste.feedback.filter(
      (f) => f.tenantId === created.customer.id,
    );
    expect(tenantFeedback).toHaveLength(2);
    expect(tenantFeedback.map((f) => f.page).sort()).toEqual([
      "/dashboard",
      "/log?shift=MORNING",
    ]);

    // Add a WasteEntry occurring now (Asia/Riyadh today) and confirm flag clears
    const menuItem = await platformAdminDb.menuItem.create({
      data: {
        tenantId: created.customer.id,
        name: "Flatbread",
        nameAr: "خبز",
        category: "Bakery",
        unit: "KG",
        unitCost: "12.00",
      },
    });
    const now = new Date();
    const todayKey = toTimeZoneDateKey(now, RIYADH_TIME_ZONE);
    await platformAdminDb.wasteEntry.create({
      data: {
        tenantId: created.customer.id,
        menuItemId: menuItem.id,
        quantity: "1.500",
        reason: "OVER_PREPARATION",
        shift: "MORNING",
        occurredAt: now,
        loggedById: staffCreated.staff.id,
        clientId: `adopt-${token}`,
      },
    });

    const overviewAfterWaste = await getAdminOverview(adminActor, now);
    const tenantAdoptionAfter = overviewAfterWaste.adoption.find(
      (a) => a.tenantId === created.customer.id,
    );
    expect(tenantAdoptionAfter?.entries14d).toBe(1);
    expect(tenantAdoptionAfter?.entriesLast3Days).toBe(1);
    expect(tenantAdoptionAfter?.noEntriesIn3Days).toBe(false);
    expect(tenantAdoptionAfter?.lastEntryAt).not.toBeNull();
    const todayPoint = tenantAdoptionAfter?.dailySeries.find(
      (d) => d.dateKey === todayKey,
    );
    expect(todayPoint?.entryCount).toBe(1);
  });
});
