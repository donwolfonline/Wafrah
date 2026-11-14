import type { MenuItem } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { AuthorizationError, type SessionUser } from "@/lib/authz";
import { platformAdminDb } from "@/lib/db";
import {
  createTenantDb,
  getPlatformAdminDb,
  getTenantDb,
  TenantIsolationError,
} from "@/lib/tenant";

describe("Multi-tenant database isolation (seeded restaurants SHAMI-JED vs DIWAN-MKH)", () => {
  it("prevents Restaurant A's manager from reading or writing Restaurant B's data in PostgreSQL", async () => {
    const [restaurantA, restaurantB] = await Promise.all([
      platformAdminDb.restaurant.findUniqueOrThrow({
        where: { code: "SHAMI-JED" },
      }),
      platformAdminDb.restaurant.findUniqueOrThrow({
        where: { code: "DIWAN-MKH" },
      }),
    ]);

    const managerASession: SessionUser = {
      userId: "manager-a-test",
      name: "Tariq Al-Shami",
      role: "OWNER",
      tenantId: restaurantA.id,
      locale: "ar",
    };

    const dbA = await getTenantDb(managerASession);

    // 1. Fetch Restaurant B's actual menu items via platformAdminDb to get real IDs
    const restaurantBItems = await platformAdminDb.menuItem.findMany({
      where: { tenantId: restaurantB.id },
    });
    expect(restaurantBItems.length).toBeGreaterThan(0);
    const targetBItem = restaurantBItems[0]!;

    // 2. READ isolation: findMany returns only Restaurant A items, even if caller passes Restaurant B's tenantId
    const visibleItems: MenuItem[] = await dbA.menuItem.findMany({
      where: { tenantId: restaurantB.id },
    });
    expect(visibleItems.length).toBeGreaterThan(0);
    expect(
      visibleItems.every((item: MenuItem) => item.tenantId === restaurantA.id),
    ).toBe(true);
    expect(
      visibleItems.some((item: MenuItem) => item.tenantId === restaurantB.id),
    ).toBe(false);

    // 3. READ isolation: findUnique / findFirst for Restaurant B's item ID returns null
    const leakedViaFindUnique = await dbA.menuItem.findUnique({
      where: { id: targetBItem.id },
    });
    expect(leakedViaFindUnique).toBeNull();

    const leakedViaFindFirst = await dbA.menuItem.findFirst({
      where: { id: targetBItem.id, tenantId: restaurantB.id },
    });
    expect(leakedViaFindFirst).toBeNull();

    // 4. WRITE isolation (create): attempting to create a MenuItem with Restaurant B's tenantId
    // forces tenantId to Restaurant A
    const createdItem = await dbA.menuItem.create({
      data: {
        tenantId: restaurantB.id,
        code: "ISO-TEST-ITEM",
        name: "Isolation Test Item",
        nameAr: "صنف اختبار العزل",
        category: "Test",
        unit: "KG",
        unitCost: "10.00",
      },
    });
    expect(createdItem.tenantId).toBe(restaurantA.id);

    // Clean up test item
    await dbA.menuItem.delete({ where: { id: createdItem.id } });

    // 5. WRITE isolation (update / updateMany): Restaurant A cannot modify Restaurant B's MenuItem
    await expect(
      dbA.menuItem.update({
        where: { id: targetBItem.id },
        data: { name: "HACKED BY RESTAURANT A" },
      }),
    ).rejects.toThrow(TenantIsolationError);

    const updateManyResult = await dbA.menuItem.updateMany({
      where: { id: targetBItem.id, tenantId: restaurantB.id },
      data: { name: "HACKED BY RESTAURANT A" },
    });
    expect(updateManyResult.count).toBe(0);

    // Verify Restaurant B's item is completely unchanged in the database
    const verifiedBItem = await platformAdminDb.menuItem.findUniqueOrThrow({
      where: { id: targetBItem.id },
    });
    expect(verifiedBItem.name).toBe(targetBItem.name);

    // 6. WRITE isolation (delete / deleteMany): Restaurant A cannot delete Restaurant B's MenuItem
    await expect(
      dbA.menuItem.delete({
        where: { id: targetBItem.id },
      }),
    ).rejects.toThrow(TenantIsolationError);

    const deleteManyResult = await dbA.menuItem.deleteMany({
      where: { id: targetBItem.id, tenantId: restaurantB.id },
    });
    expect(deleteManyResult.count).toBe(0);
  });

  it("blocks non-PLATFORM_ADMIN users from accessing platformAdminDb helper", async () => {
    const managerSession: SessionUser = {
      userId: "manager-1",
      name: "Manager",
      role: "MANAGER",
      tenantId: "tenant-1",
      locale: "ar",
    };

    await expect(getPlatformAdminDb(managerSession)).rejects.toThrow(
      AuthorizationError,
    );
  });

  it("rejects empty tenantId in createTenantDb", () => {
    expect(() => createTenantDb("")).toThrow(TenantIsolationError);
  });
});
