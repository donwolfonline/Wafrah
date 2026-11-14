import { describe, expect, it } from "vitest";
import { AuthorizationError } from "@/lib/authz";
import { platformAdminDb } from "@/lib/tenant";
import { FoodicsAdapter } from "./adapters/types";
import { ImportInputError } from "./import-files";
import {
  confirmImportForTenant,
  getImportsBootstrapForTenant,
  previewImportForTenant,
} from "./service";

describe("Data imports service, adapter seam & tenant isolation", () => {
  it("FoodicsAdapter.fetchSales throws 'not implemented'", async () => {
    const adapter = new FoodicsAdapter();
    await expect(
      adapter.fetchSales({
        from: new Date("2026-11-01T00:00:00Z"),
        to: new Date("2026-11-07T00:00:00Z"),
      }),
    ).rejects.toThrow("not implemented");
  });

  it("enforces RBAC so KITCHEN_STAFF cannot import sales", async () => {
    await expect(
      getImportsBootstrapForTenant({
        userId: "staff-user",
        role: "STAFF",
        tenantId: "fake-tenant",
        locale: "ar",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("remembers column mapping per tenant, upserts idempotently, and isolates tenants", async () => {
    const restaurantA = await platformAdminDb.restaurant.findUniqueOrThrow({
      where: { code: "SHAMI-JED" },
    });
    const restaurantB = await platformAdminDb.restaurant.findUniqueOrThrow({
      where: { code: "DIWAN-MKH" },
    });
    const managerAUser = await platformAdminDb.user.findFirstOrThrow({
      where: { tenantId: restaurantA.id, role: { in: ["MANAGER", "OWNER"] } },
    });
    const managerBUser = await platformAdminDb.user.findFirstOrThrow({
      where: { tenantId: restaurantB.id, role: { in: ["MANAGER", "OWNER"] } },
    });
    const itemA = await platformAdminDb.menuItem.findFirstOrThrow({
      where: { tenantId: restaurantA.id, code: "SHM-RICE" },
    });

    const sessionA = {
      userId: managerAUser.id,
      role: managerAUser.role,
      tenantId: restaurantA.id,
      locale: "en" as const,
    };
    const sessionB = {
      userId: managerBUser.id,
      role: managerBUser.role,
      tenantId: restaurantB.id,
      locale: "en" as const,
    };

    const customHeaders = ["CustomDay", "POSItem", "SoldQty", "SrcChannel"];
    const customMapping = {
      date: "CustomDay",
      item: "POSItem",
      quantity: "SoldQty",
      channel: "SrcChannel",
    };

    const firstRows = [
      ["2099-05-01", "Unmapped Special Dish", "10", "DINE_IN"],
      ["2099-05-02", itemA.name, "15", ""],
    ];

    const createdBatchIds: string[] = [];

    try {
      const batch1 = await confirmImportForTenant(
        {
          type: "SALES",
          fileName: "vitest-custom-sales.csv",
          headers: customHeaders,
          rawRows: firstRows,
          mapping: customMapping,
          itemOverrides: { "Unmapped Special Dish": itemA.id },
        },
        sessionA,
      );
      createdBatchIds.push(batch1.batch.id);
      expect(batch1.batch.rowsImported).toBe(2);

      // Tenant A remembers the custom mapping automatically
      const nextPreviewA = await previewImportForTenant(
        {
          type: "SALES",
          fileName: "vitest-custom-sales-2.csv",
          headers: customHeaders,
          rawRows: firstRows,
        },
        sessionA,
      );
      expect(nextPreviewA.hasSavedMapping).toBe(true);
      expect(nextPreviewA.mapping).toEqual(customMapping);

      // Re-importing detects DB duplicates cleanly
      const updatedRows = [
        ["2099-05-01", itemA.name, "22", "DINE_IN"],
        ["2099-05-02", itemA.name, "19", ""],
      ];
      const previewBeforeReimport = await previewImportForTenant(
        {
          type: "SALES",
          fileName: "vitest-reimport.csv",
          headers: customHeaders,
          rawRows: updatedRows,
        },
        sessionA,
      );
      expect(previewBeforeReimport.preview.duplicateInDbCount).toBe(2);

      const batch2 = await confirmImportForTenant(
        {
          type: "SALES",
          fileName: "vitest-reimport.csv",
          headers: customHeaders,
          rawRows: updatedRows,
          mapping: customMapping,
        },
        sessionA,
      );
      createdBatchIds.push(batch2.batch.id);
      expect(batch2.batch.rowsDuplicate).toBe(2);

      // Verify exact DB row count stayed 2 (no duplicates!) and quantities updated
      const dbRecords = await platformAdminDb.salesRecord.findMany({
        where: {
          tenantId: restaurantA.id,
          menuItemId: itemA.id,
          date: {
            in: [
              new Date("2099-05-01T00:00:00.000Z"),
              new Date("2099-05-02T00:00:00.000Z"),
            ],
          },
        },
        orderBy: { date: "asc" },
      });
      expect(dbRecords).toHaveLength(2);
      expect(dbRecords[0]?.quantitySold.toString()).toBe("22");
      expect(dbRecords[1]?.channel).toBe("UNSPECIFIED");
      expect(dbRecords[1]?.quantitySold.toString()).toBe("19");

      // Purchase upsert idempotency
      const purchaseBatch1 = await confirmImportForTenant(
        {
          type: "PURCHASES",
          fileName: "vitest-purchases.csv",
          headers: ["date", "item", "quantity", "cost"],
          rawRows: [["2099-05-03", itemA.name, "30", ""]],
          mapping: {
            date: "date",
            item: "item",
            quantity: "quantity",
            cost: "cost",
          },
        },
        sessionA,
      );
      createdBatchIds.push(purchaseBatch1.batch.id);

      const purchaseBatch2 = await confirmImportForTenant(
        {
          type: "PURCHASES",
          fileName: "vitest-purchases.csv",
          headers: ["date", "item", "quantity", "cost"],
          rawRows: [["2099-05-03", itemA.name, "35", "420.50"]],
          mapping: {
            date: "date",
            item: "item",
            quantity: "quantity",
            cost: "cost",
          },
        },
        sessionA,
      );
      createdBatchIds.push(purchaseBatch2.batch.id);
      expect(purchaseBatch2.batch.rowsDuplicate).toBe(1);

      // Tenant isolation: Tenant B does not see Tenant A's history or saved custom mapping
      const bootB = await getImportsBootstrapForTenant(sessionB);
      expect(bootB.history.some((h) => createdBatchIds.includes(h.id))).toBe(
        false,
      );
      expect(bootB.savedMappings.SALES).not.toEqual(customMapping);

      // Reject confirming when >50% of rows are invalid
      await expect(
        confirmImportForTenant(
          {
            type: "SALES",
            fileName: "too-many-bad.csv",
            headers: ["date", "item", "quantity"],
            rawRows: [
              ["bad", itemA.name, "5"],
              ["2099-05-04", itemA.name, "-1"],
              ["2099-05-05", itemA.name, "10"],
            ],
            mapping: { date: "date", item: "item", quantity: "quantity" },
          },
          sessionA,
        ),
      ).rejects.toBeInstanceOf(ImportInputError);
    } finally {
      await platformAdminDb.salesRecord.deleteMany({
        where: {
          tenantId: restaurantA.id,
          date: {
            in: [
              new Date("2099-05-01T00:00:00.000Z"),
              new Date("2099-05-02T00:00:00.000Z"),
            ],
          },
        },
      });
      await platformAdminDb.purchaseRecord.deleteMany({
        where: {
          tenantId: restaurantA.id,
          date: new Date("2099-05-03T00:00:00.000Z"),
        },
      });
      await platformAdminDb.importColumnMapping.deleteMany({
        where: { tenantId: restaurantA.id },
      });
      if (createdBatchIds.length > 0) {
        await platformAdminDb.auditLog.deleteMany({
          where: { entity: "ImportBatch", entityId: { in: createdBatchIds } },
        });
        await platformAdminDb.importBatch.deleteMany({
          where: { id: { in: createdBatchIds } },
        });
      }
    }
  });
});
