import { Prisma, type Shift, type WasteReason } from "@prisma/client";
import type { TenantPrismaClient } from "@/lib/tenant";
import type { RawDailyWasteRow, RawItemWasteRow } from "./types";

export interface PeriodSummarySqlRow {
  currentWasteSar: string;
  currentEntryCount: number;
  prevWasteSar: string;
  prevEntryCount: number;
}

export interface PurchaseSummarySqlRow {
  currentPurchaseSar: string;
  currentPurchaseCount: number;
  prevPurchaseSar: string;
  prevPurchaseCount: number;
}

export interface SalesDaysSqlRow {
  menuItemId: string;
  daysCount: number;
}

export interface DashboardSqlParams {
  timeZone: string;
  periodStartKey: string;
  periodEndKey: string;
  prevStartKey: string;
  prevEndKey: string;
  maStartKey: string;
  prevIndexStartUtc: Date;
  maIndexStartUtc: Date;
  currIndexStartUtc: Date;
  indexEndUtc: Date;
}

export function fetchPeriodSummarySql(
  db: TenantPrismaClient,
  p: DashboardSqlParams,
) {
  return db.queryTenantRaw<PeriodSummarySqlRow[]>((tid) => Prisma.sql`
    SELECT
      COALESCE(SUM(CASE WHEN ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${p.timeZone})::date BETWEEN ${p.periodStartKey}::date AND ${p.periodEndKey}::date THEN w."quantity" * m."unitCost" ELSE 0 END), 0)::text AS "currentWasteSar",
      COUNT(CASE WHEN ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${p.timeZone})::date BETWEEN ${p.periodStartKey}::date AND ${p.periodEndKey}::date THEN 1 END)::int AS "currentEntryCount",
      COALESCE(SUM(CASE WHEN ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${p.timeZone})::date BETWEEN ${p.prevStartKey}::date AND ${p.prevEndKey}::date THEN w."quantity" * m."unitCost" ELSE 0 END), 0)::text AS "prevWasteSar",
      COUNT(CASE WHEN ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${p.timeZone})::date BETWEEN ${p.prevStartKey}::date AND ${p.prevEndKey}::date THEN 1 END)::int AS "prevEntryCount"
    FROM "WasteEntry" w
    INNER JOIN "MenuItem" m ON m."id" = w."menuItemId" AND m."tenantId" = w."tenantId"
    WHERE w."tenantId" = ${tid}
      AND w."deletedAt" IS NULL
      AND w."occurredAt" >= ${p.prevIndexStartUtc}
      AND w."occurredAt" < ${p.indexEndUtc}
      AND ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${p.timeZone})::date BETWEEN ${p.prevStartKey}::date AND ${p.periodEndKey}::date
  `);
}

export function fetchDailyWasteSql(
  db: TenantPrismaClient,
  p: DashboardSqlParams,
) {
  return db.queryTenantRaw<RawDailyWasteRow[]>((tid) => Prisma.sql`
    SELECT
      TO_CHAR(((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${p.timeZone})::date, 'YYYY-MM-DD') AS "dateKey",
      COALESCE(SUM(w."quantity" * m."unitCost"), 0)::text AS "wasteSar",
      COUNT(*)::int AS "entryCount"
    FROM "WasteEntry" w
    INNER JOIN "MenuItem" m ON m."id" = w."menuItemId" AND m."tenantId" = w."tenantId"
    WHERE w."tenantId" = ${tid}
      AND w."deletedAt" IS NULL
      AND w."occurredAt" >= ${p.maIndexStartUtc}
      AND w."occurredAt" < ${p.indexEndUtc}
      AND ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${p.timeZone})::date BETWEEN ${p.maStartKey}::date AND ${p.periodEndKey}::date
    GROUP BY 1
    ORDER BY 1 ASC
  `);
}

export function fetchItemWasteSql(
  db: TenantPrismaClient,
  p: DashboardSqlParams,
) {
  return db.queryTenantRaw<RawItemWasteRow[]>((tid) => Prisma.sql`
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
      AND w."occurredAt" >= ${p.currIndexStartUtc}
      AND w."occurredAt" < ${p.indexEndUtc}
      AND ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${p.timeZone})::date BETWEEN ${p.periodStartKey}::date AND ${p.periodEndKey}::date
    GROUP BY m."id", m."code", m."name", m."nameAr", m."unit"
  `);
}

export function fetchHeatmapSql(
  db: TenantPrismaClient,
  p: DashboardSqlParams,
) {
  return db.queryTenantRaw<
    Array<{ weekday: number; shift: Shift; wasteSar: string; entryCount: number }>
  >((tid) => Prisma.sql`
    SELECT
      EXTRACT(DOW FROM ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${p.timeZone}))::int AS "weekday",
      w."shift"::text AS "shift",
      COALESCE(SUM(w."quantity" * m."unitCost"), 0)::text AS "wasteSar",
      COUNT(*)::int AS "entryCount"
    FROM "WasteEntry" w
    INNER JOIN "MenuItem" m ON m."id" = w."menuItemId" AND m."tenantId" = w."tenantId"
    WHERE w."tenantId" = ${tid}
      AND w."deletedAt" IS NULL
      AND w."occurredAt" >= ${p.currIndexStartUtc}
      AND w."occurredAt" < ${p.indexEndUtc}
      AND ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${p.timeZone})::date BETWEEN ${p.periodStartKey}::date AND ${p.periodEndKey}::date
    GROUP BY 1, w."shift"
  `);
}

export function fetchReasonWasteSql(
  db: TenantPrismaClient,
  p: DashboardSqlParams,
) {
  return db.queryTenantRaw<
    Array<{ reason: WasteReason; wasteSar: string; entryCount: number }>
  >((tid) => Prisma.sql`
    SELECT
      w."reason"::text AS "reason",
      COALESCE(SUM(w."quantity" * m."unitCost"), 0)::text AS "wasteSar",
      COUNT(*)::int AS "entryCount"
    FROM "WasteEntry" w
    INNER JOIN "MenuItem" m ON m."id" = w."menuItemId" AND m."tenantId" = w."tenantId"
    WHERE w."tenantId" = ${tid}
      AND w."deletedAt" IS NULL
      AND w."occurredAt" >= ${p.currIndexStartUtc}
      AND w."occurredAt" < ${p.indexEndUtc}
      AND ((w."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${p.timeZone})::date BETWEEN ${p.periodStartKey}::date AND ${p.periodEndKey}::date
    GROUP BY w."reason"
  `);
}

export function fetchPurchaseSummarySql(
  db: TenantPrismaClient,
  p: DashboardSqlParams,
) {
  return db.queryTenantRaw<PurchaseSummarySqlRow[]>((tid) => Prisma.sql`
    SELECT
      COALESCE(SUM(CASE WHEN p."date" BETWEEN ${p.periodStartKey}::date AND ${p.periodEndKey}::date THEN COALESCE(p."cost", p."quantity" * m."unitCost") ELSE 0 END), 0)::text AS "currentPurchaseSar",
      COUNT(CASE WHEN p."date" BETWEEN ${p.periodStartKey}::date AND ${p.periodEndKey}::date THEN 1 END)::int AS "currentPurchaseCount",
      COALESCE(SUM(CASE WHEN p."date" BETWEEN ${p.prevStartKey}::date AND ${p.prevEndKey}::date THEN COALESCE(p."cost", p."quantity" * m."unitCost") ELSE 0 END), 0)::text AS "prevPurchaseSar",
      COUNT(CASE WHEN p."date" BETWEEN ${p.prevStartKey}::date AND ${p.prevEndKey}::date THEN 1 END)::int AS "prevPurchaseCount"
    FROM "PurchaseRecord" p
    INNER JOIN "MenuItem" m ON m."id" = p."menuItemId" AND m."tenantId" = p."tenantId"
    WHERE p."tenantId" = ${tid}
      AND p."date" BETWEEN ${p.prevStartKey}::date AND ${p.periodEndKey}::date
  `);
}

export function fetchSalesDaysPerItemSql(db: TenantPrismaClient) {
  return db.queryTenantRaw<SalesDaysSqlRow[]>((tid) => Prisma.sql`
    SELECT s."menuItemId" AS "menuItemId", COUNT(DISTINCT s."date")::int AS "daysCount"
    FROM "SalesRecord" s
    WHERE s."tenantId" = ${tid}
    GROUP BY s."menuItemId"
  `);
}
