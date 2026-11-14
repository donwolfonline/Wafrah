import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/authz";
import { getPlatformAdminDb } from "@/lib/tenant";
import {
  AdminServiceError,
  deleteRestaurantSchema,
  restaurantIdSchema,
} from "./schemas";

export interface DeleteRestaurantResult {
  deletedId: string;
  code: string;
  deletedCounts: {
    users: number;
    menuItems: number;
    wasteEntries: number;
    salesRecords: number;
    purchaseRecords: number;
    auditLogs: number;
  };
}

/**
 * Permanently deletes a restaurant tenant and all associated operational and
 * personal data (including tenant audit logs) inside a single transaction.
 * Restricted to PLATFORM_ADMIN and requires exact restaurant name confirmation.
 */
export async function deleteAdminRestaurant(
  actor: SessionUser | null | undefined,
  rawRestaurantId: string,
  rawInput: unknown,
): Promise<DeleteRestaurantResult> {
  const platformAdminDb = await getPlatformAdminDb(actor);
  const parsedId = restaurantIdSchema.safeParse(rawRestaurantId);
  if (!parsedId.success) {
    throw new AdminServiceError("Invalid restaurant ID", 400);
  }
  const restaurantId = parsedId.data;

  const parsedInput = deleteRestaurantSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new AdminServiceError(
      parsedInput.error.issues[0]?.message ?? "Confirmation name is required",
      400,
    );
  }

  const existing = await platformAdminDb.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, code: true, name: true, nameAr: true },
  });

  if (!existing) {
    throw new AdminServiceError("Restaurant not found", 404);
  }

  const typedName = parsedInput.data.confirmName.trim();
  const matchesEnglish = typedName === existing.name.trim();
  const matchesArabic = typedName === existing.nameAr.trim();

  if (!matchesEnglish && !matchesArabic) {
    throw new AdminServiceError(
      "Confirmation name does not match restaurant name",
      400,
    );
  }

  const deletedCounts = await platformAdminDb.$transaction(async (tx) => {
    const [
      usersCount,
      menuItemsCount,
      wasteCount,
      salesCount,
      purchasesCount,
    ] = await Promise.all([
      tx.user.count({ where: { tenantId: restaurantId } }),
      tx.menuItem.count({ where: { tenantId: restaurantId } }),
      tx.wasteEntry.count({ where: { tenantId: restaurantId } }),
      tx.salesRecord.count({ where: { tenantId: restaurantId } }),
      tx.purchaseRecord.count({ where: { tenantId: restaurantId } }),
    ]);

    // Delete WasteEntry explicitly before Restaurant cascade because WasteEntry.loggedBy
    // has onDelete: Restrict against User (which also cascades from Restaurant).
    await tx.wasteEntry.deleteMany({ where: { tenantId: restaurantId } });
    const auditDeleted = await tx.auditLog.deleteMany({
      where: { tenantId: restaurantId },
    });
    await tx.restaurant.delete({ where: { id: restaurantId } });

    const counts = {
      users: usersCount,
      menuItems: menuItemsCount,
      wasteEntries: wasteCount,
      salesRecords: salesCount,
      purchaseRecords: purchasesCount,
      auditLogs: auditDeleted.count,
    };

    // Record a non-PII platform audit event for PDPL compliance tracking.
    await tx.auditLog.create({
      data: {
        tenantId: null,
        userId: actor?.userId ?? null,
        action: "ADMIN_RESTAURANT_DELETED",
        entity: "Restaurant",
        entityId: existing.id,
        metadata: {
          code: existing.code,
          deletedCounts: counts,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return counts;
  });

  return {
    deletedId: existing.id,
    code: existing.code,
    deletedCounts,
  };
}
