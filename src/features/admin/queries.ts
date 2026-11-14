import { Prisma } from "@prisma/client";
import { shiftDateKey, toTimeZoneDateKey } from "@/features/insights";
import type { SessionUser } from "@/lib/authz";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { getPlatformAdminDb } from "@/lib/tenant";
import { getAdminAdoptionAndFeedback } from "./adoption-queries";
import {
  aggregateTenantWape,
  buildDailyWasteSeries,
  HEALTH_DAILY_WINDOW_DAYS,
  type RawPlatformDailyRow,
  summarizeCronJobLogs,
  WAPE_ALERT_THRESHOLD_PCT,
} from "./health-math";
import type { AdminCustomerSummary, AdminOverviewDto } from "./types";

interface TenantWasteActivitySqlRow {
  tenantId: string;
  lastActivityAt: Date | null;
  entriesLast7Days: number;
}

export async function getAdminOverview(
  actor?: SessionUser | null,
  now: Date = new Date(),
): Promise<AdminOverviewDto> {
  const platformAdminDb = await getPlatformAdminDb(actor);

  const todayKey = toTimeZoneDateKey(now, RIYADH_TIME_ZONE);
  const sevenDayStartKey = shiftDateKey(todayKey, -6);
  const fourteenDayStartKey = shiftDateKey(
    todayKey,
    -(HEALTH_DAILY_WINDOW_DAYS - 1),
  );
  const indexStart14Utc = new Date(
    `${shiftDateKey(fourteenDayStartKey, -1)}T00:00:00.000Z`,
  );
  const indexEndUtc = new Date(`${shiftDateKey(todayKey, 2)}T00:00:00.000Z`);

  const [
    restaurants,
    tenantActivityRows,
    dailyWasteRows,
    latestDailyCron,
    latestWeeklyCron,
    latestMonthlyCron,
    latestForecastCron,
    forecastAuditRows,
  ] = await Promise.all([
    platformAdminDb.restaurant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        city: true,
        type: true,
        createdAt: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            renewsAt: true,
          },
        },
        _count: {
          select: {
            users: true,
          },
        },
      },
    }),
    platformAdminDb.$queryRaw<TenantWasteActivitySqlRow[]>(Prisma.sql`
      SELECT
        w."tenantId" AS "tenantId",
        MAX(w."occurredAt") AS "lastActivityAt",
        COUNT(
          CASE
            WHEN ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${RIYADH_TIME_ZONE})::date
              BETWEEN ${sevenDayStartKey}::date AND ${todayKey}::date
            THEN 1
          END
        )::int AS "entriesLast7Days"
      FROM "WasteEntry" w
      WHERE w."deletedAt" IS NULL
      GROUP BY w."tenantId"
    `),
    platformAdminDb.$queryRaw<RawPlatformDailyRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(
          ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${RIYADH_TIME_ZONE})::date,
          'YYYY-MM-DD'
        ) AS "dateKey",
        COUNT(*)::int AS "entryCount",
        COUNT(DISTINCT w."tenantId")::int AS "tenantCount"
      FROM "WasteEntry" w
      WHERE w."deletedAt" IS NULL
        AND w."occurredAt" >= ${indexStart14Utc}
        AND w."occurredAt" < ${indexEndUtc}
        AND ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${RIYADH_TIME_ZONE})::date
          BETWEEN ${fourteenDayStartKey}::date AND ${todayKey}::date
      GROUP BY 1
      ORDER BY 1 ASC
    `),
    platformAdminDb.auditLog.findFirst({
      where: { action: "CRON_DAILY_COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { action: true, createdAt: true, metadata: true },
    }),
    platformAdminDb.auditLog.findFirst({
      where: { action: "CRON_WEEKLY_COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { action: true, createdAt: true, metadata: true },
    }),
    platformAdminDb.auditLog.findFirst({
      where: { action: "CRON_MONTHLY_COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { action: true, createdAt: true, metadata: true },
    }),
    platformAdminDb.auditLog.findFirst({
      where: { action: "FORECAST_RUN_COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { action: true, createdAt: true, metadata: true },
    }),
    platformAdminDb.auditLog.findMany({
      where: {
        action: "FORECAST_RUN_COMPLETED",
        tenantId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        tenantId: true,
        createdAt: true,
        metadata: true,
      },
    }),
  ]);

  const activityByTenant = new Map(
    tenantActivityRows.map((row) => [row.tenantId, row]),
  );

  const customers: AdminCustomerSummary[] = restaurants.map((r) => {
    const activity = activityByTenant.get(r.id);
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      nameAr: r.nameAr,
      city: r.city,
      type: r.type,
      plan: r.subscription?.plan ?? null,
      status: r.subscription?.status ?? null,
      renewsAt: r.subscription?.renewsAt?.toISOString() ?? null,
      userCount: r._count.users,
      lastActivityAt: activity?.lastActivityAt
        ? new Date(activity.lastActivityAt).toISOString()
        : null,
      entriesLast7Days: activity?.entriesLast7Days ?? 0,
      createdAt: r.createdAt.toISOString(),
    };
  });

  const series = buildDailyWasteSeries(
    todayKey,
    dailyWasteRows,
    HEALTH_DAILY_WINDOW_DAYS,
  );
  const cronJobs = summarizeCronJobLogs({
    CRON_DAILY_COMPLETED: latestDailyCron,
    CRON_WEEKLY_COMPLETED: latestWeeklyCron,
    CRON_MONTHLY_COMPLETED: latestMonthlyCron,
    FORECAST_RUN_COMPLETED: latestForecastCron,
  });
  const forecastAccuracy = aggregateTenantWape(
    restaurants.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      nameAr: r.nameAr,
    })),
    forecastAuditRows,
    WAPE_ALERT_THRESHOLD_PCT,
  );
  const { adoption, feedback } = await getAdminAdoptionAndFeedback(
    platformAdminDb,
    customers.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      nameAr: c.nameAr,
      status: c.status,
    })),
    now,
  );
  const { listAdminLeads } = await import("./leads-service");
  const leads = await listAdminLeads(actor, undefined, platformAdminDb);

  return {
    customers,
    health: {
      generatedAt: now.toISOString(),
      windowStartDateKey: series.windowStartDateKey,
      windowEndDateKey: series.windowEndDateKey,
      wapeThresholdPct: WAPE_ALERT_THRESHOLD_PCT,
      flaggedWapeCount: forecastAccuracy.filter((item) => item.flaggedHighWape)
        .length,
      dailyEntries: series.points,
      cronJobs,
      forecastAccuracy,
    },
    adoption,
    feedback,
    leads,
  };
}
