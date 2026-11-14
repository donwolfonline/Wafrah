import { recordAuditLog } from "@/lib/audit";
import { requireRole, type SessionUser } from "@/lib/authz";
import { getTenantDb } from "@/lib/tenant";
import { createZipBuffer } from "@/lib/zip";
import { serializeTenantExportCsvEntries } from "./export-tables";

export interface TenantExportArchive {
  fileName: string;
  zipBuffer: Buffer;
  entryNames: string[];
}

function sanitizeCodeForFilename(code: string): string {
  return (
    code
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "restaurant"
  );
}

/**
 * Exports all restaurant data belonging strictly to the authenticated manager/owner's
 * tenant as a ZIP archive of formula-safe UTF-8 CSV files.
 * Credential hashes (`passwordHash`, `pinHash`) are excluded.
 */
export async function exportTenantDataAsZip(
  sessionUserOverride?: SessionUser | null,
): Promise<TenantExportArchive> {
  const user = await requireRole(["MANAGER", "OWNER"], sessionUserOverride);
  const db = await getTenantDb(user);
  const tenantId = user.tenantId!;

  const [
    restaurantRows,
    users,
    menuItems,
    wasteEntries,
    salesRecords,
    purchaseRecords,
    rawEvents,
    forecastResults,
    alerts,
    notificationPreferences,
    subscriptions,
    auditLogs,
    importColumnMappings,
    importBatches,
    feedbacks,
  ] = await Promise.all([
    db.restaurant.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        city: true,
        type: true,
        timezone: true,
        shiftConfig: true,
        baselineStart: true,
        baselineEnd: true,
        createdAt: true,
      },
    }),
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tenantId: true,
        name: true,
        role: true,
        email: true,
        username: true,
        locale: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
    db.menuItem.findMany({ orderBy: { createdAt: "asc" } }),
    db.wasteEntry.findMany({ orderBy: { occurredAt: "asc" } }),
    db.salesRecord.findMany({ orderBy: { date: "asc" } }),
    db.purchaseRecord.findMany({ orderBy: { date: "asc" } }),
    db.eventCalendar.findMany({ orderBy: { startDate: "asc" } }),
    db.forecastResult.findMany({ orderBy: { forDate: "asc" } }),
    db.alert.findMany({ orderBy: { createdAt: "asc" } }),
    db.notificationPreference.findMany({ orderBy: { createdAt: "asc" } }),
    db.subscription.findMany(),
    db.auditLog.findMany({ orderBy: { createdAt: "asc" } }),
    db.importColumnMapping.findMany({ orderBy: { createdAt: "asc" } }),
    db.importBatch.findMany({ orderBy: { createdAt: "asc" } }),
    db.feedback.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  // EventCalendar tenant query returns global (tenantId: null) plus tenant events;
  // restrict the PDPL data export strictly to this restaurant's own rows.
  const tenantEvents = rawEvents.filter((event) => event.tenantId === tenantId);

  const csvEntries = serializeTenantExportCsvEntries({
    restaurant: restaurantRows,
    users,
    menuItems,
    wasteEntries,
    salesRecords,
    purchaseRecords,
    eventCalendar: tenantEvents,
    forecastResults,
    alerts,
    notificationPreferences,
    subscriptions,
    auditLogs,
    importColumnMappings,
    importBatches,
    feedbacks,
  });

  const now = new Date();
  const zipBuffer = createZipBuffer(csvEntries, now);
  const safeCode = sanitizeCodeForFilename(restaurantRows[0]?.code ?? tenantId);
  const dateStamp = now.toISOString().slice(0, 10);

  await recordAuditLog({
    tenantId,
    userId: user.userId,
    action: "TENANT_DATA_EXPORTED",
    entity: "Restaurant",
    entityId: tenantId,
    metadata: {
      fileCount: csvEntries.length,
      dateStamp,
    },
  });

  return {
    fileName: `wafrah-export-${safeCode}-${dateStamp}.zip`,
    zipBuffer,
    entryNames: csvEntries.map((entry) => entry.name),
  };
}
