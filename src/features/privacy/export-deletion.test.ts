import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminServiceError, deleteAdminRestaurant } from "@/features/admin";
import { AuthorizationError, type SessionUser } from "@/lib/authz";
import { platformAdminDb } from "@/lib/db";
import { hashSecret } from "@/lib/password";
import { extractZipEntries } from "@/lib/zip";
import { exportTenantDataAsZip } from "./export";

describe("Security & PDPL regression — Tenant data export (ZIP) and admin deletion", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let tenantAId = "";
  let tenantBId = "";
  let tenantBCode = "";
  let tenantBName = "";
  let globalEventId = "";
  let managerASession: SessionUser;
  let staffASession: SessionUser;
  let adminSession: SessionUser;

  const secretHashMarkerA = hashSecret(`SecretA-${suffix}`);
  const secretHashMarkerB = hashSecret(`SecretB-${suffix}`);

  beforeAll(async () => {
    const restA = await platformAdminDb.restaurant.create({
      data: {
        code: `EXPA-${suffix}`.toUpperCase(),
        name: `Export Tenant A ${suffix}`,
        nameAr: `مطعم تصدير أ ${suffix}`,
        city: "Riyadh",
        type: "Restaurant",
      },
    });
    const restB = await platformAdminDb.restaurant.create({
      data: {
        code: `EXPB-${suffix}`.toUpperCase(),
        name: `Delete Target B ${suffix}`,
        nameAr: `مطعم حذف ب ${suffix}`,
        city: "Dammam",
        type: "Hotel",
      },
    });
    tenantAId = restA.id;
    tenantBId = restB.id;
    tenantBCode = restB.code;
    tenantBName = restB.name;

    const [mgrA, staffA, mgrB, itemA, itemB, globalEv] = await Promise.all([
      platformAdminDb.user.create({
        data: {
          tenantId: restA.id,
          name: `Owner A ${suffix}`,
          role: "OWNER",
          email: `owner-a-${suffix}@test.local`,
          username: `ownera-${suffix}`,
          passwordHash: secretHashMarkerA,
        },
      }),
      platformAdminDb.user.create({
        data: {
          tenantId: restA.id,
          name: `Chef A ${suffix}`,
          role: "STAFF",
          username: `chefa-${suffix}`,
          pinHash: secretHashMarkerA,
        },
      }),
      platformAdminDb.user.create({
        data: {
          tenantId: restB.id,
          name: `Owner B ${suffix}`,
          role: "OWNER",
          email: `owner-b-${suffix}@test.local`,
          username: `ownerb-${suffix}`,
          passwordHash: secretHashMarkerB,
        },
      }),
      platformAdminDb.menuItem.create({
        data: {
          tenantId: restA.id,
          code: `EA-${suffix}`,
          name: `Export Dish A ${suffix}`,
          nameAr: "طبق أ",
          category: "Mains",
          unit: "KG",
          unitCost: "12.00",
        },
      }),
      platformAdminDb.menuItem.create({
        data: {
          tenantId: restB.id,
          code: `EB-${suffix}`,
          name: `Secret Dish B ${suffix}`,
          nameAr: "طبق ب",
          category: "Mains",
          unit: "KG",
          unitCost: "25.00",
        },
      }),
      platformAdminDb.eventCalendar.create({
        data: {
          tenantId: null,
          name: `GlobalHolidayMarker-${suffix}`,
          nameAr: "إجازة عامة",
          startDate: new Date("2026-11-12T00:00:00.000Z"),
          endDate: new Date("2026-11-12T00:00:00.000Z"),
          demandMultiplier: "1.100",
        },
      }),
    ]);
    globalEventId = globalEv.id;

    await Promise.all([
      platformAdminDb.wasteEntry.create({
        data: {
          tenantId: restA.id,
          menuItemId: itemA.id,
          quantity: "1.500",
          reason: "EXPIRED",
          shift: "MORNING",
          loggedById: staffA.id,
          clientId: `exp-waste-a-${suffix}`,
        },
      }),
      platformAdminDb.wasteEntry.create({
        data: {
          tenantId: restB.id,
          menuItemId: itemB.id,
          quantity: "3.000",
          reason: "ORDER_ERROR",
          shift: "EVENING",
          loggedById: mgrB.id,
          clientId: `exp-waste-b-${suffix}`,
        },
      }),
      platformAdminDb.eventCalendar.create({
        data: {
          tenantId: restA.id,
          name: `TenantAEvent-${suffix}`,
          nameAr: "حدث أ",
          startDate: new Date("2026-11-15T00:00:00.000Z"),
          endDate: new Date("2026-11-15T00:00:00.000Z"),
          demandMultiplier: "1.250",
        },
      }),
      platformAdminDb.auditLog.create({
        data: {
          tenantId: restB.id,
          userId: mgrB.id,
          action: "TENANT_B_SECRET_LOG",
          entity: "Restaurant",
          entityId: restB.id,
          metadata: {} satisfies Prisma.InputJsonObject,
        },
      }),
    ]);

    managerASession = {
      userId: mgrA.id,
      name: mgrA.name,
      role: "OWNER",
      tenantId: restA.id,
      locale: "en",
    };
    staffASession = {
      userId: staffA.id,
      name: staffA.name,
      role: "STAFF",
      tenantId: restA.id,
      locale: "ar",
    };
    const existingAdmin = await platformAdminDb.user.findFirst({
      where: { role: "PLATFORM_ADMIN" },
    });
    adminSession = {
      userId: existingAdmin?.id ?? mgrA.id,
      name: existingAdmin?.name ?? "Admin",
      role: "PLATFORM_ADMIN",
      tenantId: null,
      locale: "en",
    };
  });

  afterAll(async () => {
    await platformAdminDb.wasteEntry.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await platformAdminDb.auditLog.deleteMany({
      where: {
        OR: [
          { tenantId: { in: [tenantAId, tenantBId] } },
          { action: "ADMIN_RESTAURANT_DELETED", entityId: tenantBId },
        ],
      },
    });
    if (globalEventId) {
      await platformAdminDb.eventCalendar.deleteMany({
        where: { id: globalEventId },
      });
    }
    await platformAdminDb.restaurant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
  });

  it("enforces role checks on data export and exports only caller tenant CSVs without credential hashes", async () => {
    await expect(exportTenantDataAsZip(null)).rejects.toThrow(AuthorizationError);
    await expect(exportTenantDataAsZip(staffASession)).rejects.toThrow(
      AuthorizationError,
    );
    await expect(exportTenantDataAsZip(adminSession)).rejects.toThrow(
      AuthorizationError,
    );

    const archive = await exportTenantDataAsZip(managerASession);
    expect(archive.fileName).toContain(".zip");

    const entries = extractZipEntries(archive.zipBuffer);
    expect(entries.size).toBe(15);
    expect(entries.has("restaurant.csv")).toBe(true);
    expect(entries.has("users.csv")).toBe(true);
    expect(entries.has("waste-entries.csv")).toBe(true);
    expect(entries.has("events.csv")).toBe(true);
    expect(entries.has("feedback.csv")).toBe(true);

    const allText = Array.from(entries.values())
      .map((buf) => buf.toString("utf8"))
      .join("\n");

    expect(allText).toContain(`Export Dish A ${suffix}`);
    expect(allText).toContain(`TenantAEvent-${suffix}`);
    expect(allText).not.toContain(tenantBId);
    expect(allText).not.toContain(`Secret Dish B ${suffix}`);
    expect(allText).not.toContain("TENANT_B_SECRET_LOG");
    expect(allText).not.toContain(`GlobalHolidayMarker-${suffix}`);

    const usersCsv = entries.get("users.csv")!.toString("utf8");
    expect(usersCsv).not.toContain("passwordHash");
    expect(usersCsv).not.toContain("pinHash");
    expect(usersCsv).not.toContain(secretHashMarkerA);
  });

  it("enforces admin-only deletion with exact restaurant name confirmation and records a non-PII audit log", async () => {
    await expect(
      deleteAdminRestaurant(managerASession, tenantBId, {
        confirmName: tenantBName,
      }),
    ).rejects.toThrow(AuthorizationError);

    await expect(
      deleteAdminRestaurant(staffASession, tenantBId, {
        confirmName: tenantBName,
      }),
    ).rejects.toThrow(AuthorizationError);

    await expect(
      deleteAdminRestaurant(adminSession, tenantBId, {
        confirmName: "Wrong Restaurant Name",
      }),
    ).rejects.toThrow(AdminServiceError);

    // Tenant B still exists after failed confirmation
    const stillExists = await platformAdminDb.restaurant.findUnique({
      where: { id: tenantBId },
    });
    expect(stillExists).not.toBeNull();

    const result = await deleteAdminRestaurant(adminSession, tenantBId, {
      confirmName: tenantBName,
    });
    expect(result.deletedId).toBe(tenantBId);
    expect(result.code).toBe(tenantBCode);
    expect(result.deletedCounts.wasteEntries).toBe(1);
    expect(result.deletedCounts.users).toBe(1);

    expect(
      await platformAdminDb.restaurant.findUnique({ where: { id: tenantBId } }),
    ).toBeNull();
    expect(
      await platformAdminDb.user.count({ where: { tenantId: tenantBId } }),
    ).toBe(0);
    expect(
      await platformAdminDb.auditLog.count({ where: { tenantId: tenantBId } }),
    ).toBe(0);

    const deletionAudit = await platformAdminDb.auditLog.findFirst({
      where: {
        action: "ADMIN_RESTAURANT_DELETED",
        entityId: tenantBId,
      },
    });
    expect(deletionAudit).not.toBeNull();
    expect(deletionAudit?.tenantId).toBeNull();
    expect(JSON.stringify(deletionAudit?.metadata)).not.toContain(
      `owner-b-${suffix}@test.local`,
    );
  });
});
