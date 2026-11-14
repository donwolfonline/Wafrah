import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  validateQuantityForUnit,
  wasteEntryCreateSchema,
} from "@/features/waste/schemas";
import {
  createWasteEntryForUser,
  getWasteLogBootstrapForUser,
  undoWasteEntryForUser,
  WasteValidationError,
} from "@/features/waste/service";
import { detectShift, parseShiftConfig } from "@/features/waste/shift";
import type { SessionUser } from "@/lib/authz";
import { platformAdminDb, TenantIsolationError } from "@/lib/tenant";

describe("Shift detection in Asia/Riyadh", () => {
  it("detects MORNING (05:00–14:59), EVENING (15:00–22:59), and NIGHT (23:00–04:59) in Asia/Riyadh", () => {
    // 05:00 Riyadh = 02:00 UTC -> MORNING
    expect(detectShift(new Date("2026-11-12T02:00:00.000Z"))).toBe("MORNING");
    // 14:59 Riyadh = 11:59 UTC -> MORNING
    expect(detectShift(new Date("2026-11-12T11:59:00.000Z"))).toBe("MORNING");
    // 15:00 Riyadh = 12:00 UTC -> EVENING
    expect(detectShift(new Date("2026-11-12T12:00:00.000Z"))).toBe("EVENING");
    // 22:59 Riyadh = 19:59 UTC -> EVENING
    expect(detectShift(new Date("2026-11-12T19:59:00.000Z"))).toBe("EVENING");
    // 23:00 Riyadh = 20:00 UTC -> NIGHT
    expect(detectShift(new Date("2026-11-12T20:00:00.000Z"))).toBe("NIGHT");
    // 04:59 Riyadh = 01:59 UTC -> NIGHT
    expect(detectShift(new Date("2026-11-12T01:59:00.000Z"))).toBe("NIGHT");
  });

  it("respects custom Restaurant.shiftConfig and falls back to defaults on invalid config", () => {
    const ramadanConfig = {
      MORNING: "09:00",
      EVENING: "16:30",
      NIGHT: "01:00",
    };
    // 07:00 Riyadh = 04:00 UTC -> between 01:00 and 09:00 -> NIGHT
    expect(
      detectShift(new Date("2026-11-12T04:00:00.000Z"), ramadanConfig),
    ).toBe("NIGHT");
    // 10:00 Riyadh = 07:00 UTC -> MORNING
    expect(
      detectShift(new Date("2026-11-12T07:00:00.000Z"), ramadanConfig),
    ).toBe("MORNING");
    // 17:00 Riyadh = 14:00 UTC -> EVENING
    expect(
      detectShift(new Date("2026-11-12T14:00:00.000Z"), ramadanConfig),
    ).toBe("EVENING");

    expect(parseShiftConfig("not-json")).toEqual({
      MORNING: "05:00",
      EVENING: "15:00",
      NIGHT: "23:00",
    });
  });
});

describe("Waste entry Zod validation and configurable unit max limits", () => {
  it("validates valid payload and rejects <= 0 or invalid enum/UUID inputs", () => {
    const valid = wasteEntryCreateSchema.safeParse({
      clientId: randomUUID(),
      menuItemId: "item-123",
      quantity: "1.25",
      reason: "OVER_PREPARATION",
      shift: "MORNING",
    });
    expect(valid.success).toBe(true);

    expect(
      wasteEntryCreateSchema.safeParse({
        clientId: randomUUID(),
        menuItemId: "item-123",
        quantity: 0,
        reason: "OVER_PREPARATION",
      }).success,
    ).toBe(false);

    expect(
      wasteEntryCreateSchema.safeParse({
        clientId: randomUUID(),
        menuItemId: "item-123",
        quantity: "-3.5",
        reason: "OVER_PREPARATION",
      }).success,
    ).toBe(false);

    expect(
      wasteEntryCreateSchema.safeParse({
        clientId: "not-a-uuid",
        menuItemId: "item-123",
        quantity: "1.5",
        reason: "OVER_PREPARATION",
      }).success,
    ).toBe(false);
  });

  it("rejects absurdly large quantities exceeding default or custom max per unit", () => {
    expect(validateQuantityForUnit("12.5", "KG").ok).toBe(true);
    expect(validateQuantityForUnit("0", "KG")).toEqual({
      ok: false,
      code: "QUANTITY_MUST_BE_POSITIVE",
    });
    expect(validateQuantityForUnit("500.5", "KG")).toEqual({
      ok: false,
      code: "QUANTITY_EXCEEDS_MAX",
      maxAllowed: 500,
    });
    expect(validateQuantityForUnit("25", "KG", { KG: 20 })).toEqual({
      ok: false,
      code: "QUANTITY_EXCEEDS_MAX",
      maxAllowed: 20,
    });
  });
});

describe("Idempotent waste entry creation, tenant isolation, and 10s Undo soft-delete", () => {
  it("creates exactly one row when called twice with the same (tenantId, clientId), enforces tenant ownership, and supports 10s Undo soft-delete", async () => {
    const [restaurantA, restaurantB] = await Promise.all([
      platformAdminDb.restaurant.findUniqueOrThrow({
        where: { code: "SHAMI-JED" },
      }),
      platformAdminDb.restaurant.findUniqueOrThrow({
        where: { code: "DIWAN-MKH" },
      }),
    ]);

    const [staffA, itemA, itemB] = await Promise.all([
      platformAdminDb.user.findFirstOrThrow({
        where: { tenantId: restaurantA.id, role: "STAFF" },
      }),
      platformAdminDb.menuItem.findFirstOrThrow({
        where: { tenantId: restaurantA.id, active: true },
      }),
      platformAdminDb.menuItem.findFirstOrThrow({
        where: { tenantId: restaurantB.id, active: true },
      }),
    ]);

    const staffSessionA: SessionUser = {
      userId: staffA.id,
      name: staffA.name,
      role: "STAFF",
      tenantId: restaurantA.id,
      locale: "ar",
    };

    const bootstrap = await getWasteLogBootstrapForUser(staffSessionA);
    expect(bootstrap.items.length).toBeGreaterThan(0);
    expect(bootstrap.recentItemIds.length).toBeLessThanOrEqual(6);

    const clientId = randomUUID();
    const createdAt = new Date("2026-11-12T10:00:00.000Z"); // 13:00 Riyadh -> MORNING

    // 1. First POST with clientId creates the entry
    const firstResult = await createWasteEntryForUser(
      staffSessionA,
      {
        clientId,
        menuItemId: itemA.id,
        quantity: "2.5",
        reason: "OVER_PREPARATION",
        tenantId: restaurantB.id, // Attempted spoofing must be ignored
      },
      { now: createdAt },
    );

    expect(firstResult.created).toBe(true);
    expect(firstResult.entry.clientId).toBe(clientId);
    expect(firstResult.entry.quantity).toBe("2.5");
    expect(firstResult.entry.shift).toBe("MORNING");

    // 2. Second POST with the SAME clientId is idempotent and returns the same row
    const secondResult = await createWasteEntryForUser(
      staffSessionA,
      {
        clientId,
        menuItemId: itemA.id,
        quantity: "2.5",
        reason: "OVER_PREPARATION",
      },
      { now: new Date(createdAt.getTime() + 1_000) },
    );

    expect(secondResult.created).toBe(false);
    expect(secondResult.entry.id).toBe(firstResult.entry.id);

    const dbCount = await platformAdminDb.wasteEntry.count({
      where: { tenantId: restaurantA.id, clientId },
    });
    expect(dbCount).toBe(1);

    // 3. Rejects logging against another tenant's menuItemId
    await expect(
      createWasteEntryForUser(staffSessionA, {
        clientId: randomUUID(),
        menuItemId: itemB.id,
        quantity: "1",
        reason: "EXPIRED",
      }),
    ).rejects.toThrow(TenantIsolationError);

    // 4. Rejects absurdly large quantity
    await expect(
      createWasteEntryForUser(
        staffSessionA,
        {
          clientId: randomUUID(),
          menuItemId: itemA.id,
          quantity: "99999",
          reason: "EXPIRED",
        },
        { maxByUnit: { [itemA.unit]: 50 } },
      ),
    ).rejects.toThrow(WasteValidationError);

    // 5. Rejects Undo after 10 seconds
    await expect(
      undoWasteEntryForUser(
        staffSessionA,
        { clientId },
        { now: new Date(createdAt.getTime() + 11_000) },
      ),
    ).rejects.toThrow(WasteValidationError);

    // 6. Succeeds Undo within 10 seconds (soft-deletes by setting deletedAt)
    const undoResult = await undoWasteEntryForUser(
      staffSessionA,
      { clientId },
      { now: new Date(createdAt.getTime() + 4_000) },
    );
    expect(undoResult.status).toBe("deleted");
    expect(undoResult.entry?.deletedAt).not.toBeNull();

    // Clean up test entry and audit logs
    await platformAdminDb.auditLog.deleteMany({
      where: { entityId: firstResult.entry.id },
    });
    await platformAdminDb.wasteEntry.delete({
      where: { id: firstResult.entry.id },
    });
  });
});
