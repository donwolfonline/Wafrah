import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/authz";
import { getPlatformAdminDb } from "@/lib/tenant";
import { AdminServiceError, restaurantIdSchema } from "./schemas";
import type { TenantDiagnosticsDto } from "./types";

export async function getTenantDiagnostics(
  actor: SessionUser | null | undefined,
  rawRestaurantId: string,
): Promise<TenantDiagnosticsDto> {
  const platformAdminDb = await getPlatformAdminDb(actor);
  const parsedId = restaurantIdSchema.safeParse(rawRestaurantId);
  if (!parsedId.success) {
    throw new AdminServiceError("Invalid restaurant ID", 400);
  }
  const restaurantId = parsedId.data;

  const restaurant = await platformAdminDb.restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      subscription: {
        select: { plan: true, status: true, renewsAt: true },
      },
    },
  });

  if (!restaurant) {
    throw new AdminServiceError("Restaurant not found", 404);
  }

  const [
    usersTotal,
    usersActive,
    menuItemsTotal,
    menuItemsActive,
    wasteEntriesCount,
    salesRecordsCount,
    purchaseRecordsCount,
    forecastResultsCount,
    alertsTotalCount,
    alertsUnreadCount,
    lastImports,
    lastAlerts,
  ] = await Promise.all([
    platformAdminDb.user.count({ where: { tenantId: restaurantId } }),
    platformAdminDb.user.count({
      where: { tenantId: restaurantId, active: true },
    }),
    platformAdminDb.menuItem.count({ where: { tenantId: restaurantId } }),
    platformAdminDb.menuItem.count({
      where: { tenantId: restaurantId, active: true },
    }),
    platformAdminDb.wasteEntry.count({
      where: { tenantId: restaurantId, deletedAt: null },
    }),
    platformAdminDb.salesRecord.count({ where: { tenantId: restaurantId } }),
    platformAdminDb.purchaseRecord.count({ where: { tenantId: restaurantId } }),
    platformAdminDb.forecastResult.count({ where: { tenantId: restaurantId } }),
    platformAdminDb.alert.count({ where: { tenantId: restaurantId } }),
    platformAdminDb.alert.count({
      where: { tenantId: restaurantId, status: "UNREAD" },
    }),
    platformAdminDb.importBatch.findMany({
      where: { tenantId: restaurantId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        type: true,
        fileName: true,
        rowsImported: true,
        rowsRejected: true,
        rowsDuplicate: true,
        createdAt: true,
      },
    }),
    platformAdminDb.alert.findMany({
      where: { tenantId: restaurantId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        type: true,
        severity: true,
        status: true,
        messageKey: true,
        createdAt: true,
        notifiedAt: true,
      },
    }),
  ]);

  await platformAdminDb.auditLog.create({
    data: {
      tenantId: restaurant.id,
      userId: actor?.userId ?? null,
      action: "ADMIN_DIAGNOSTICS_VIEWED",
      entity: "Restaurant",
      entityId: restaurant.id,
      metadata: {
        code: restaurant.code,
      } satisfies Prisma.InputJsonObject,
    },
  });

  return {
    tenant: {
      id: restaurant.id,
      code: restaurant.code,
      name: restaurant.name,
      nameAr: restaurant.nameAr,
      city: restaurant.city,
      type: restaurant.type,
      plan: restaurant.subscription?.plan ?? null,
      status: restaurant.subscription?.status ?? null,
      renewsAt: restaurant.subscription?.renewsAt?.toISOString() ?? null,
      baselineStart: restaurant.baselineStart?.toISOString() ?? null,
      baselineEnd: restaurant.baselineEnd?.toISOString() ?? null,
      createdAt: restaurant.createdAt.toISOString(),
    },
    counts: {
      usersTotal,
      usersActive,
      menuItemsTotal,
      menuItemsActive,
      wasteEntriesCount,
      salesRecordsCount,
      purchaseRecordsCount,
      forecastResultsCount,
      alertsTotalCount,
      alertsUnreadCount,
    },
    lastImports: lastImports.map((batch) => ({
      id: batch.id,
      type: batch.type,
      fileName: batch.fileName,
      rowsImported: batch.rowsImported,
      rowsRejected: batch.rowsRejected,
      rowsDuplicate: batch.rowsDuplicate,
      createdAt: batch.createdAt.toISOString(),
    })),
    lastAlerts: lastAlerts.map((alert) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      status: alert.status,
      messageKey: alert.messageKey,
      createdAt: alert.createdAt.toISOString(),
      notifiedAt: alert.notifiedAt?.toISOString() ?? null,
    })),
  };
}
