import { Prisma } from "@prisma/client";
import type { TenantPrismaClient } from "@/lib/tenant";
import type { ReportDateRangeSql } from "./queries";

export function fetchDailyWasteBreakdownSql(
  db: TenantPrismaClient,
  r: ReportDateRangeSql,
) {
  return db.queryTenantRaw<
    Array<{
      dateKey: string;
      wasteSar: string;
      wasteQtySum: string;
      entryCount: number;
    }>
  >(
    (tid) => Prisma.sql`
      SELECT
        TO_CHAR(((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${r.timeZone})::date, 'YYYY-MM-DD') AS "dateKey",
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
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  );
}

export function fetchDailySalesAndPurchasesSql(
  db: TenantPrismaClient,
  startKey: string,
  endKey: string,
) {
  return db.queryTenantRaw<
    Array<{ dateKey: string; unitsSold: string; purchaseSar: string }>
  >(
    (tid) => Prisma.sql`
      WITH sales_by_day AS (
        SELECT
          TO_CHAR(s."date", 'YYYY-MM-DD') AS "dateKey",
          COALESCE(SUM(s."quantitySold" * m."salesUnitFactor"), 0) AS "unitsSold"
        FROM "SalesRecord" s
        INNER JOIN "MenuItem" m ON m."id" = s."menuItemId" AND m."tenantId" = s."tenantId"
        WHERE s."tenantId" = ${tid}
          AND s."date" BETWEEN ${startKey}::date AND ${endKey}::date
        GROUP BY 1
      ),
      purch_by_day AS (
        SELECT
          TO_CHAR(p."date", 'YYYY-MM-DD') AS "dateKey",
          COALESCE(SUM(COALESCE(p."cost", 0)), 0) AS "purchaseSar"
        FROM "PurchaseRecord" p
        WHERE p."tenantId" = ${tid}
          AND p."date" BETWEEN ${startKey}::date AND ${endKey}::date
        GROUP BY 1
      )
      SELECT
        COALESCE(s."dateKey", p."dateKey") AS "dateKey",
        COALESCE(s."unitsSold", 0)::text AS "unitsSold",
        COALESCE(p."purchaseSar", 0)::text AS "purchaseSar"
      FROM sales_by_day s
      FULL OUTER JOIN purch_by_day p ON p."dateKey" = s."dateKey"
      ORDER BY 1 ASC
    `,
  );
}
