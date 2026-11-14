import { shiftDateKey, toTimeZoneDateKey } from "@/features/insights";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import type { platformAdminDb } from "@/lib/tenant";
import {
  ADOPTION_WINDOW_DAYS,
  type AdoptionTenantDescriptor,
  buildTenantAdoptionRows,
  type RawTenantDailyEntryRow,
} from "./adoption-math";
import type { AdminFeedbackItem, TenantAdoptionRow } from "./types";

type PlatformAdminClient = typeof platformAdminDb;

export async function getAdminAdoptionAndFeedback(
  adminDb: PlatformAdminClient,
  tenants: AdoptionTenantDescriptor[],
  now: Date = new Date(),
): Promise<{
  adoption: TenantAdoptionRow[];
  feedback: AdminFeedbackItem[];
}> {
  const endDateKey = toTimeZoneDateKey(now, RIYADH_TIME_ZONE);
  const windowStartDateKey = shiftDateKey(
    endDateKey,
    -(ADOPTION_WINDOW_DAYS - 1),
  );
  const windowStartUtc = new Date(`${windowStartDateKey}T00:00:00+03:00`);

  const [dailyRawRows, lastEntryGroups, lastLoginGroups, feedbackRows] =
    await Promise.all([
      adminDb.$queryRaw<
        Array<{ tenantId: string; dateKey: string; entryCount: bigint | number }>
      >`
        SELECT
          "tenantId" AS "tenantId",
          to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD') AS "dateKey",
          COUNT(*) AS "entryCount"
        FROM "WasteEntry"
        WHERE "deletedAt" IS NULL
          AND "occurredAt" >= ${windowStartUtc}
        GROUP BY "tenantId", "dateKey"
      `,
      adminDb.wasteEntry.groupBy({
        by: ["tenantId"],
        where: { deletedAt: null },
        _max: { occurredAt: true },
      }),
      adminDb.user.groupBy({
        by: ["tenantId"],
        where: {
          tenantId: { not: null },
          lastLoginAt: { not: null },
        },
        _max: { lastLoginAt: true },
      }),
      adminDb.feedback.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          tenantId: true,
          userId: true,
          page: true,
          rating: true,
          message: true,
          createdAt: true,
          tenant: {
            select: { code: true, name: true, nameAr: true },
          },
          user: {
            select: { name: true, username: true, role: true },
          },
        },
      }),
    ]);

  const dailyRows: RawTenantDailyEntryRow[] = dailyRawRows.map((row) => ({
    tenantId: row.tenantId,
    dateKey: row.dateKey,
    entryCount: Number(row.entryCount),
  }));

  const lastEntryByTenant = new Map<string, Date>();
  for (const group of lastEntryGroups) {
    if (group._max.occurredAt) {
      lastEntryByTenant.set(group.tenantId, group._max.occurredAt);
    }
  }

  const lastLoginByTenant = new Map<string, Date>();
  for (const group of lastLoginGroups) {
    if (group.tenantId && group._max.lastLoginAt) {
      lastLoginByTenant.set(group.tenantId, group._max.lastLoginAt);
    }
  }

  const adoption = buildTenantAdoptionRows(
    endDateKey,
    tenants,
    dailyRows,
    lastEntryByTenant,
    lastLoginByTenant,
  );

  const feedback: AdminFeedbackItem[] = feedbackRows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    restaurantCode: row.tenant?.code ?? null,
    restaurantName: row.tenant?.name ?? null,
    restaurantNameAr: row.tenant?.nameAr ?? null,
    userId: row.userId,
    userName: row.user.name,
    username: row.user.username,
    userRole: row.user.role,
    page: row.page,
    rating: row.rating,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  }));

  return { adoption, feedback };
}
