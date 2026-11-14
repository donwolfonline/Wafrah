import { describe, expect, it } from "vitest";
import { AuthorizationError } from "@/lib/authz";
import { platformAdminDb, TenantIsolationError } from "@/lib/tenant";
import { parseMenuItemsCsv } from "./csv";
import { computeDefaultShortageCost, menuItemInputSchema } from "./schemas";
import {
  createMenuItemForTenant,
  listMenuItemsForTenant,
  setMenuItemActiveForTenant,
  updateMenuItemForTenant,
} from "./service";

describe("Menu item validation rules (Zod)", () => {
  it("requires item name in at least one language (Arabic or English)", () => {
    const missingBoth = menuItemInputSchema.safeParse({
      name: "   ",
      nameAr: "",
      category: "Mains",
      unit: "KG",
      unitCost: "45.00",
    });
    expect(missingBoth.success).toBe(false);
    if (!missingBoth.success) {
      expect(missingBoth.error.issues[0]?.message).toBe("nameRequired");
    }

    const arabicOnly = menuItemInputSchema.safeParse({
      name: "",
      nameAr: "مندي لحم",
      category: "الأطباق الرئيسية",
      unit: "KG",
      unitCost: "45.00",
    });
    expect(arabicOnly.success).toBe(true);

    const englishOnly = menuItemInputSchema.safeParse({
      name: "Lamb Mandi",
      nameAr: "",
      category: "Mains",
      unit: "PORTION",
      unitCost: "32.50",
    });
    expect(englishOnly.success).toBe(true);
  });

  it("enforces unitCost > 0 and shortageCost >= 0", () => {
    const zeroCost = menuItemInputSchema.safeParse({
      name: "Kabsa",
      category: "Mains",
      unit: "KG",
      unitCost: "0",
    });
    expect(zeroCost.success).toBe(false);

    const negativeCost = menuItemInputSchema.safeParse({
      name: "Kabsa",
      category: "Mains",
      unit: "KG",
      unitCost: "-15",
    });
    expect(negativeCost.success).toBe(false);

    const negativeShortage = menuItemInputSchema.safeParse({
      name: "Kabsa",
      category: "Mains",
      unit: "KG",
      unitCost: "40",
      shortageCost: "-0.01",
    });
    expect(negativeShortage.success).toBe(false);

    const zeroShortage = menuItemInputSchema.safeParse({
      name: "Kabsa",
      category: "Mains",
      unit: "KG",
      unitCost: "40",
      shortageCost: "0",
    });
    expect(zeroShortage.success).toBe(true);
    if (zeroShortage.success) {
      expect(zeroShortage.data.shortageCost).toBe("0.00");
    }

    const emptyShortage = menuItemInputSchema.safeParse({
      name: "Kabsa",
      category: "Mains",
      unit: "KG",
      unitCost: "40",
      shortageCost: "",
    });
    expect(emptyShortage.success).toBe(true);
    if (emptyShortage.success) {
      expect(emptyShortage.data.shortageCost).toBeNull();
      expect(computeDefaultShortageCost(emptyShortage.data.unitCost)).toBe(
        "60.00",
      );
    }
  });
});

describe("Menu CSV parsing (UTF-8 BOM, Arabic text, valid & invalid rows)", () => {
  it("parses CSV with UTF-8 BOM, Arabic text, quoted commas, and flags invalid rows with reasons", () => {
    const csvWithBom =
      "\uFEFFname,nameAr,category,unit,unitCost,shortageCost\r\n" +
      '"Mutabbaq, Savory",مطبق مالح,Appetizers,PIECE,12.50,18.75\r\n' +
      ",كنافة بالقشطة,Desserts,PORTION,28.00,\r\n" +
      "Bad Cost Item,صنف خاطئ,Mains,KG,0,10.00\r\n" +
      ",,Mains,GRAMS,-5,-2\r\n";

    const parsed = parseMenuItemsCsv(csvWithBom);
    expect(parsed.headerError).toBeNull();
    expect(parsed.validRows).toHaveLength(2);
    expect(parsed.invalidRows).toHaveLength(2);

    expect(parsed.validRows[0]?.data).toEqual({
      code: null,
      name: "Mutabbaq, Savory",
      nameAr: "مطبق مالح",
      category: "Appetizers",
      unit: "PIECE",
      unitCost: "12.50",
      shortageCost: "18.75",
    });

    expect(parsed.validRows[1]?.data).toEqual({
      code: null,
      name: "",
      nameAr: "كنافة بالقشطة",
      category: "Desserts",
      unit: "PORTION",
      unitCost: "28.00",
      shortageCost: null,
    });

    expect(parsed.invalidRows[0]?.rowNumber).toBe(4);
    expect(parsed.invalidRows[0]?.reasons).toContain("invalidUnitCost");

    expect(parsed.invalidRows[1]?.rowNumber).toBe(5);
    expect(parsed.invalidRows[1]?.reasons).toEqual(
      expect.arrayContaining([
        "nameRequired",
        "invalidUnit",
        "invalidUnitCost",
        "invalidShortageCost",
      ]),
    );
  });

  it("returns missingRequiredColumns when required headers are absent", () => {
    const badHeaders = "title,price\nKabsa,25";
    const parsed = parseMenuItemsCsv(badHeaders);
    expect(parsed.headerError).toBe("missingRequiredColumns");
  });
});

describe("Menu endpoints multi-tenant isolation, RBAC, and soft-delete", () => {
  it("enforces menu.manage RBAC, isolates tenants, and soft-deactivates items with audit logs", async () => {
    const [restaurantA, restaurantB] = await Promise.all([
      platformAdminDb.restaurant.findUniqueOrThrow({
        where: { code: "SHAMI-JED" },
      }),
      platformAdminDb.restaurant.findUniqueOrThrow({
        where: { code: "DIWAN-MKH" },
      }),
    ]);

    const seededOwnerA = await platformAdminDb.user.findFirstOrThrow({
      where: { tenantId: restaurantA.id, role: "OWNER" },
    });

    const managerA = {
      userId: seededOwnerA.id,
      name: seededOwnerA.name,
      role: "MANAGER" as const,
      tenantId: restaurantA.id,
      locale: "ar",
    };

    const staffA = {
      userId: "test-staff-a",
      name: "Staff A",
      role: "STAFF" as const,
      tenantId: restaurantA.id,
      locale: "ar",
    };

    // 1. STAFF cannot access menu management
    await expect(listMenuItemsForTenant(staffA)).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    // 2. Manager A only sees Restaurant A's items
    const itemsA = await listMenuItemsForTenant(managerA);
    expect(itemsA.length).toBeGreaterThan(0);
    expect(itemsA.every((i) => i.tenantId === restaurantA.id)).toBe(true);

    // 3. Manager A cannot update or deactivate Restaurant B's item
    const itemB = await platformAdminDb.menuItem.findFirstOrThrow({
      where: { tenantId: restaurantB.id },
    });

    await expect(
      updateMenuItemForTenant(
        {
          id: itemB.id,
          input: {
            name: "Cross Tenant Hijack",
            nameAr: "اختراق",
            category: "Mains",
            unit: "KG",
            unitCost: "50.00",
          },
        },
        managerA,
      ),
    ).rejects.toBeInstanceOf(TenantIsolationError);

    await expect(
      setMenuItemActiveForTenant({ id: itemB.id, active: false }, managerA),
    ).rejects.toBeInstanceOf(TenantIsolationError);

    // 4. Manager A creates, updates, and soft-deactivates an item (with AuditLog verification)
    const created = await createMenuItemForTenant(
      {
        name: "Test Sayadieh Fish",
        nameAr: "صيادية سمك تجريبية",
        category: "Seafood",
        unit: "PORTION",
        unitCost: "42.00",
        shortageCost: null,
      },
      managerA,
    );

    expect(created.tenantId).toBe(restaurantA.id);
    expect(created.effectiveShortageCost).toBe("63.00");
    expect(created.active).toBe(true);

    try {
      const updated = await updateMenuItemForTenant(
        {
          id: created.id,
          input: {
            name: "Test Sayadieh Fish Deluxe",
            nameAr: "صيادية سمك فاخرة",
            category: "Seafood",
            unit: "PORTION",
            unitCost: "48.00",
            shortageCost: "75.00",
          },
        },
        managerA,
      );
      expect(updated.unitCost).toBe("48.00");
      expect(updated.shortageCost).toBe("75.00");
      expect(updated.effectiveShortageCost).toBe("75.00");

      const deactivated = await setMenuItemActiveForTenant(
        { id: created.id, active: false },
        managerA,
      );
      expect(deactivated.active).toBe(false);

      // Verify item still exists in DB (soft-deleted, not hard-deleted)
      const persistedInDb = await platformAdminDb.menuItem.findUnique({
        where: { id: created.id },
      });
      expect(persistedInDb).not.toBeNull();
      expect(persistedInDb?.active).toBe(false);

      // Verify AuditLog entries
      const logs = await platformAdminDb.auditLog.findMany({
        where: { entity: "MenuItem", entityId: created.id },
      });
      const actions = logs.map((l) => l.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          "MENU_ITEM_CREATED",
          "MENU_ITEM_UPDATED",
          "MENU_ITEM_DEACTIVATED",
        ]),
      );
    } finally {
      await platformAdminDb.auditLog.deleteMany({
        where: { entity: "MenuItem", entityId: created.id },
      });
      await platformAdminDb.menuItem.delete({
        where: { id: created.id },
      });
    }
  });
});
