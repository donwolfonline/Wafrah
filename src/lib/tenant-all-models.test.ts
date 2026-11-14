import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/authz";
import { platformAdminDb } from "@/lib/db";
import { hashSecret } from "@/lib/password";
import { getTenantDb, TenantIsolationError } from "@/lib/tenant";

describe("Security regression — Cross-tenant isolation across all 15 Prisma models", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let tenantAId = "";
  let tenantBId = "";
  let userAId = "";
  let menuItemBId = "";
  let globalEventId = "";
  let eventBId = "";
  let dbA: Awaited<ReturnType<typeof getTenantDb>>;
  const foreignIds = new Map<string, string>();

  beforeAll(async () => {
    const hash = hashSecret("TestPass123!");
    const [restA, restB] = await Promise.all([
      platformAdminDb.restaurant.create({
        data: { code: `SECA-${suffix}`.toUpperCase(), name: `Sec Test A ${suffix}`, nameAr: `اختبار أمان أ ${suffix}`, city: "Riyadh", type: "Restaurant" },
      }),
      platformAdminDb.restaurant.create({
        data: { code: `SECB-${suffix}`.toUpperCase(), name: `Sec Test B ${suffix}`, nameAr: `اختبار أمان ب ${suffix}`, city: "Jeddah", type: "Restaurant" },
      }),
    ]);
    tenantAId = restA.id;
    tenantBId = restB.id;

    const [userA, userB, itemB] = await Promise.all([
      platformAdminDb.user.create({
        data: { tenantId: restA.id, name: "Manager A", role: "OWNER", email: `mgr-a-${suffix}@test.local`, username: `mgra-${suffix}`, passwordHash: hash },
      }),
      platformAdminDb.user.create({
        data: { tenantId: restB.id, name: "Manager B", role: "OWNER", email: `mgr-b-${suffix}@test.local`, username: `mgrb-${suffix}`, passwordHash: hash },
      }),
      platformAdminDb.menuItem.create({
        data: { tenantId: restB.id, code: `IB-${suffix}`, name: "Item B", nameAr: "صنف ب", category: "Mains", unit: "KG", unitCost: "20.00" },
      }),
    ]);
    userAId = userA.id;
    menuItemBId = itemB.id;

    const today = new Date("2026-11-10T00:00:00.000Z");
    const [wasteB, salesB, purchaseB, evB, globalEv, forecastB, alertB, prefB, subB, auditB, mappingB, batchB, feedbackB] =
      await Promise.all([
        platformAdminDb.wasteEntry.create({ data: { tenantId: restB.id, menuItemId: itemB.id, quantity: "2.500", reason: "EXPIRED", shift: "MORNING", loggedById: userB.id, clientId: `waste-${suffix}` } }),
        platformAdminDb.salesRecord.create({ data: { tenantId: restB.id, menuItemId: itemB.id, date: today, quantitySold: "10.000", channel: "DINE_IN", source: "CSV" } }),
        platformAdminDb.purchaseRecord.create({ data: { tenantId: restB.id, menuItemId: itemB.id, date: today, quantity: "12.000", cost: "240.00" } }),
        platformAdminDb.eventCalendar.create({ data: { tenantId: restB.id, name: `TenantB Event ${suffix}`, nameAr: "حدث ب", startDate: today, endDate: today, demandMultiplier: "1.200" } }),
        platformAdminDb.eventCalendar.create({ data: { tenantId: null, name: `Global Event ${suffix}`, nameAr: "حدث عام", startDate: today, endDate: today, demandMultiplier: "1.100" } }),
        platformAdminDb.forecastResult.create({ data: { tenantId: restB.id, menuItemId: itemB.id, forDate: today, meanQty: "10.000", lowQty: "8.000", highQty: "12.000", recommendedQty: "11.000", method: "TEST", inputsSnapshot: { test: true } } }),
        platformAdminDb.alert.create({ data: { tenantId: restB.id, menuItemId: itemB.id, type: "WASTE_SPIKE", severity: "WARNING", messageKey: "test", messageParams: {}, dedupeKey: `alert-${suffix}` } }),
        platformAdminDb.notificationPreference.create({ data: { tenantId: restB.id, userId: userB.id } }),
        platformAdminDb.subscription.create({ data: { tenantId: restB.id, plan: "SMALL", status: "ACTIVE" } }),
        platformAdminDb.auditLog.create({ data: { tenantId: restB.id, userId: userB.id, action: "TEST_B", entity: "Restaurant", entityId: restB.id, metadata: {} satisfies Prisma.InputJsonObject } }),
        platformAdminDb.importColumnMapping.create({ data: { tenantId: restB.id, type: "SALES", mapping: { date: "date" } } }),
        platformAdminDb.importBatch.create({ data: { tenantId: restB.id, uploadedById: userB.id, type: "SALES", fileName: "b.csv", rowsImported: 1, rowsRejected: 0, rowsDuplicate: 0 } }),
        platformAdminDb.feedback.create({ data: { tenantId: restB.id, userId: userB.id, page: "/dashboard", rating: 4, message: `Feedback B ${suffix}` } }),
      ]);

    eventBId = evB.id;
    globalEventId = globalEv.id;
    foreignIds.set("user", userB.id);
    foreignIds.set("menuItem", itemB.id);
    foreignIds.set("wasteEntry", wasteB.id);
    foreignIds.set("salesRecord", salesB.id);
    foreignIds.set("purchaseRecord", purchaseB.id);
    foreignIds.set("forecastResult", forecastB.id);
    foreignIds.set("alert", alertB.id);
    foreignIds.set("notificationPreference", prefB.id);
    foreignIds.set("subscription", subB.id);
    foreignIds.set("auditLog", auditB.id);
    foreignIds.set("importColumnMapping", mappingB.id);
    foreignIds.set("importBatch", batchB.id);
    foreignIds.set("feedback", feedbackB.id);

    const sessionA: SessionUser = { userId: userA.id, name: userA.name, role: "OWNER", tenantId: restA.id, locale: "en" };
    dbA = await getTenantDb(sessionA);
  });

  afterAll(async () => {
    await platformAdminDb.wasteEntry.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await platformAdminDb.auditLog.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await platformAdminDb.eventCalendar.deleteMany({ where: { id: globalEventId } });
    await platformAdminDb.restaurant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  });

  it("blocks cross-tenant reads, updates, and deletes across Restaurant and all 12 strict tenant models", async () => {
    expect(await dbA.restaurant.findUnique({ where: { id: tenantBId } })).toBeNull();
    await expect(dbA.restaurant.update({ where: { id: tenantBId }, data: { city: "Hacked" } })).rejects.toThrow(TenantIsolationError);
    await expect(dbA.restaurant.delete({ where: { id: tenantBId } })).rejects.toThrow(TenantIsolationError);

    const modelUpdates: Array<[string, Record<string, unknown>]> = [
      ["user", { name: "Tampered" }],
      ["menuItem", { name: "Tampered" }],
      ["wasteEntry", { note: "Tampered" }],
      ["salesRecord", { quantitySold: "99" }],
      ["purchaseRecord", { quantity: "99" }],
      ["forecastResult", { method: "Tampered" }],
      ["alert", { status: "DISMISSED" }],
      ["notificationPreference", { weeklySummary: false }],
      ["subscription", { plan: "CHAIN" }],
      ["auditLog", { action: "Tampered" }],
      ["importColumnMapping", { mapping: {} }],
      ["importBatch", { fileName: "hack.csv" }],
      ["feedback", { message: "Tampered feedback" }],
    ];

    for (const [modelName, updateData] of modelUpdates) {
      const foreignId = foreignIds.get(modelName)!;
      const delegate = (dbA as unknown as Record<string, {
        findUnique: (args: { where: { id: string } }) => Promise<unknown>;
        findMany: (args: { where: { tenantId: string } }) => Promise<Array<{ tenantId?: string | null }>>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
        delete: (args: { where: { id: string } }) => Promise<unknown>;
      }>)[modelName]!;

      expect(await delegate.findUnique({ where: { id: foreignId } })).toBeNull();
      const rows = await delegate.findMany({ where: { tenantId: tenantBId } });
      expect(rows.some((row) => row.tenantId === tenantBId)).toBe(false);
      await expect(delegate.update({ where: { id: foreignId }, data: updateData })).rejects.toThrow(TenantIsolationError);
      await expect(delegate.delete({ where: { id: foreignId } })).rejects.toThrow(TenantIsolationError);
    }
  });

  it("blocks cross-tenant foreign-key writes using Tenant B menuItemId and protects EventCalendar rows", async () => {
    const day = new Date("2026-11-11T00:00:00.000Z");

    await expect(
      dbA.wasteEntry.create({
        data: { tenantId: tenantAId, menuItemId: menuItemBId, quantity: "1.000", reason: "OTHER", shift: "MORNING", loggedById: userAId, clientId: `x-${suffix}` },
      }),
    ).rejects.toThrow(TenantIsolationError);
    await expect(
      dbA.salesRecord.create({ data: { tenantId: tenantAId, menuItemId: menuItemBId, date: day, quantitySold: "5.000", channel: "DINE_IN" } }),
    ).rejects.toThrow(TenantIsolationError);
    await expect(
      dbA.purchaseRecord.create({ data: { tenantId: tenantAId, menuItemId: menuItemBId, date: day, quantity: "5.000" } }),
    ).rejects.toThrow(TenantIsolationError);
    await expect(
      dbA.forecastResult.create({
        data: { tenantId: tenantAId, menuItemId: menuItemBId, forDate: day, meanQty: "1", lowQty: "1", highQty: "1", recommendedQty: "1", method: "TEST", inputsSnapshot: {} },
      }),
    ).rejects.toThrow(TenantIsolationError);
    await expect(
      dbA.alert.create({
        data: { tenantId: tenantAId, menuItemId: menuItemBId, type: "WASTE_SPIKE", severity: "INFO", messageKey: "x", messageParams: {}, dedupeKey: `fk-alert-${suffix}` },
      }),
    ).rejects.toThrow(TenantIsolationError);

    const visibleEvents = await dbA.eventCalendar.findMany({});
    expect(visibleEvents.some((e) => e.id === eventBId)).toBe(false);
    expect(visibleEvents.some((e) => e.id === globalEventId)).toBe(true);
    await expect(dbA.eventCalendar.update({ where: { id: eventBId }, data: { name: "Tampered" } })).rejects.toThrow(TenantIsolationError);
    await expect(dbA.eventCalendar.delete({ where: { id: globalEventId } })).rejects.toThrow(TenantIsolationError);

    await expect(dbA.lead.findMany({})).rejects.toThrow(TenantIsolationError);
    await expect(
      dbA.lead.create({
        data: {
          name: "Unauthorized",
          businessName: "Tenant A Tamper",
          city: "MAKKAH",
          role: "Manager",
          phone: "+966500000099",
          branches: 1,
          posSystem: "NONE",
          locale: "ar",
          consent: true,
          consentAt: day,
        },
      }),
    ).rejects.toThrow(TenantIsolationError);
  });
});
