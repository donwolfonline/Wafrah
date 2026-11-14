import { Prisma } from "@prisma/client";
import { shiftDateKey } from "@/features/insights";
import type { TenantPrismaClient } from "@/lib/tenant";

export interface ReportDateRangeSql {
  timeZone: string;
  startKey: string;
  endKey: string;
  indexStartUtc: Date;
  indexEndUtc: Date;
}

export function makeWasteSqlRange(
  timeZone: string,
  startKey: string,
  endKey: string,
): ReportDateRangeSql {
  return {
    timeZone,
    startKey,
    endKey,
    indexStartUtc: new Date(`${shiftDateKey(startKey, -1)}T00:00:00.000Z`),
    indexEndUtc: new Date(`${shiftDateKey(endKey, 2)}T00:00:00.000Z`),
  };
}

export function fetchFirstWasteDateSql(
  db: TenantPrismaClient,
  timeZone: string,
) {
  return db.queryTenantRaw<Array<{ firstWasteDate: string | null }>>(
    (tid) => Prisma.sql`
      SELECT
        TO_CHAR(MIN(((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date), 'YYYY-MM-DD') AS "firstWasteDate"
      FROM "WasteEntry" w
      WHERE w."tenantId" = ${tid}
        AND w."deletedAt" IS NULL
    `,
  );
}

export function fetchDistinctReportMonthsSql(
  db: TenantPrismaClient,
  timeZone: string,
) {
  return db.queryTenantRaw<Array<{ yearMonth: string }>>(
    (tid) => Prisma.sql`
      SELECT "yearMonth"
      FROM (
        SELECT DISTINCT TO_CHAR(((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date, 'YYYY-MM') AS "yearMonth"
        FROM "WasteEntry" w
        WHERE w."tenantId" = ${tid} AND w."deletedAt" IS NULL
        UNION
        SELECT DISTINCT TO_CHAR(s."date", 'YYYY-MM') AS "yearMonth"
        FROM "SalesRecord" s
        WHERE s."tenantId" = ${tid}
      ) months
      ORDER BY "yearMonth" DESC
    `,
  );
}

export function fetchPeriodWasteTotalSql(
  db: TenantPrismaClient,
  r: ReportDateRangeSql,
) {
  return db.queryTenantRaw<
    Array<{ wasteSar: string; wasteQtySum: string; entryCount: number }>
  >(
    (tid) => Prisma.sql`
      SELECT
        COALESCE(SUM(w."quantity" * m."unitCost"), 0)::text AS "wasteSar",
        COALESCE(SUM(w."quantity"), 0)::text AS "wasteQtySum",
        COUNT(*)::int AS "entryCount"
      FROM "WasteEntry" w
      INNER JOIN "MenuItem" m ON m."id" = w."menuItemId" AND m."tenantId" = w."tenantId"
      WHERE w."tenantId" = ${tid}
        AND w."deletedAt" IS NULL
        AND w."occurredAt" >= ${r.indexStartUtc}
        AND w."occurredAt" < ${r.indexEndUtc}
        AND ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${r.timeZone})::date BETWEEN ${r.startKey}::date AND ${r.endKey}::date
    `,
  );
}

export function fetchPeriodSalesTotalSql(
  db: TenantPrismaClient,
  startKey: string,
  endKey: string,
) {
  return db.queryTenantRaw<Array<{ unitsSold: string; salesCount: number }>>(
    (tid) => Prisma.sql`
      SELECT
        COALESCE(SUM(s."quantitySold" * m."salesUnitFactor"), 0)::text AS "unitsSold",
        COUNT(*)::int AS "salesCount"
      FROM "SalesRecord" s
      INNER JOIN "MenuItem" m ON m."id" = s."menuItemId" AND m."tenantId" = s."tenantId"
      WHERE s."tenantId" = ${tid}
        AND s."date" BETWEEN ${startKey}::date AND ${endKey}::date
    `,
  );
}

export function fetchItemWasteTotalsSql(
  db: TenantPrismaClient,
  r: ReportDateRangeSql,
) {
  return db.queryTenantRaw<
    Array<{
      menuItemId: string;
      code: string | null;
      name: string;
      nameAr: string;
      unit: string;
      wasteQty: string;
      wasteSar: string;
      entryCount: number;
    }>
  >(
    (tid) => Prisma.sql`
      SELECT
        m."id" AS "menuItemId",
        m."code" AS "code",
        m."name" AS "name",
        m."nameAr" AS "nameAr",
        m."unit"::text AS "unit",
        COALESCE(SUM(w."quantity"), 0)::text AS "wasteQty",
        COALESCE(SUM(w."quantity" * m."unitCost"), 0)::text AS "wasteSar",
        COUNT(*)::int AS "entryCount"
      FROM "WasteEntry" w
      INNER JOIN "MenuItem" m ON m."id" = w."menuItemId" AND m."tenantId" = w."tenantId"
      WHERE w."tenantId" = ${tid}
        AND w."deletedAt" IS NULL
        AND w."occurredAt" >= ${r.indexStartUtc}
        AND w."occurredAt" < ${r.indexEndUtc}
        AND ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${r.timeZone})::date BETWEEN ${r.startKey}::date AND ${r.endKey}::date
      GROUP BY m."id", m."code", m."name", m."nameAr", m."unit"
      ORDER BY SUM(w."quantity" * m."unitCost") DESC
    `,
  );
}

export function fetchItemWeekdayBreakdownSql(
  db: TenantPrismaClient,
  r: ReportDateRangeSql,
) {
  return db.queryTenantRaw<
    Array<{
      menuItemId: string;
      weekday: number;
      totalSar: string;
      totalQty: string;
      dayCount: number;
    }>
  >(
    (tid) => Prisma.sql`
      SELECT
        daily."menuItemId" AS "menuItemId",
        EXTRACT(DOW FROM daily."bizDate")::int AS "weekday",
        SUM(daily."daySar")::text AS "totalSar",
        SUM(daily."dayQty")::text AS "totalQty",
        COUNT(*)::int AS "dayCount"
      FROM (
        SELECT
          w."menuItemId",
          ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${r.timeZone})::date AS "bizDate",
          SUM(w."quantity" * m."unitCost") AS "daySar",
          SUM(w."quantity") AS "dayQty"
        FROM "WasteEntry" w
        INNER JOIN "MenuItem" m ON m."id" = w."menuItemId" AND m."tenantId" = w."tenantId"
        WHERE w."tenantId" = ${tid}
          AND w."deletedAt" IS NULL
          AND w."occurredAt" >= ${r.indexStartUtc}
          AND w."occurredAt" < ${r.indexEndUtc}
          AND ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${r.timeZone})::date BETWEEN ${r.startKey}::date AND ${r.endKey}::date
        GROUP BY w."menuItemId", 2
      ) daily
      GROUP BY daily."menuItemId", 2
    `,
  );
}

export function fetchReasonTotalsSql(
  db: TenantPrismaClient,
  r: ReportDateRangeSql,
) {
  return db.queryTenantRaw<
    Array<{ reason: string; wasteSar: string; entryCount: number }>
  >(
    (tid) => Prisma.sql`
      SELECT
        w."reason"::text AS "reason",
        COALESCE(SUM(w."quantity" * m."unitCost"), 0)::text AS "wasteSar",
        COUNT(*)::int AS "entryCount"
      FROM "WasteEntry" w
      INNER JOIN "MenuItem" m ON m."id" = w."menuItemId" AND m."tenantId" = w."tenantId"
      WHERE w."tenantId" = ${tid}
        AND w."deletedAt" IS NULL
        AND w."occurredAt" >= ${r.indexStartUtc}
        AND w."occurredAt" < ${r.indexEndUtc}
        AND ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${r.timeZone})::date BETWEEN ${r.startKey}::date AND ${r.endKey}::date
      GROUP BY w."reason"
      ORDER BY SUM(w."quantity" * m."unitCost") DESC
    `,
  );
}

export function fetchTopHotspotSql(
  db: TenantPrismaClient,
  r: ReportDateRangeSql,
) {
  return db.queryTenantRaw<
    Array<{ weekday: number; shift: string; wasteSar: string; entryCount: number }>
  >(
    (tid) => Prisma.sql`
      SELECT
        EXTRACT(DOW FROM ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${r.timeZone})::date)::int AS "weekday",
        w."shift"::text AS "shift",
        COALESCE(SUM(w."quantity" * m."unitCost"), 0)::text AS "wasteSar",
        COUNT(*)::int AS "entryCount"
      FROM "WasteEntry" w
      INNER JOIN "MenuItem" m ON m."id" = w."menuItemId" AND m."tenantId" = w."tenantId"
      WHERE w."tenantId" = ${tid}
        AND w."deletedAt" IS NULL
        AND w."occurredAt" >= ${r.indexStartUtc}
        AND w."occurredAt" < ${r.indexEndUtc}
        AND ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${r.timeZone})::date BETWEEN ${r.startKey}::date AND ${r.endKey}::date
      GROUP BY 1, w."shift"
      ORDER BY SUM(w."quantity" * m."unitCost") DESC
      LIMIT 1
    `,
  );
}
