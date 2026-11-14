import { Prisma } from "@prisma/client";
import { shiftDateKey } from "@/features/insights";
import type {
  CronJobKey,
  CronJobRunSummary,
  CronRunStatus,
  DailyPlatformWastePoint,
  TenantWapeSummary,
} from "./types";

export const WAPE_ALERT_THRESHOLD_PCT = 40;
export const HEALTH_DAILY_WINDOW_DAYS = 14;

export interface RawPlatformDailyRow {
  dateKey: string;
  entryCount: number;
  tenantCount: number;
}

export function buildDailyWasteSeries(
  endDateKey: string,
  rows: RawPlatformDailyRow[],
  days: number = HEALTH_DAILY_WINDOW_DAYS,
): {
  windowStartDateKey: string;
  windowEndDateKey: string;
  points: DailyPlatformWastePoint[];
} {
  const countMap = new Map<string, RawPlatformDailyRow>();
  for (const row of rows) {
    countMap.set(row.dateKey, row);
  }

  const windowStartDateKey = shiftDateKey(endDateKey, -(days - 1));
  const points: DailyPlatformWastePoint[] = [];

  for (let offset = 0; offset < days; offset++) {
    const dateKey = shiftDateKey(windowStartDateKey, offset);
    const hit = countMap.get(dateKey);
    points.push({
      dateKey,
      entryCount: hit?.entryCount ?? 0,
      tenantCount: hit?.tenantCount ?? 0,
    });
  }

  return {
    windowStartDateKey,
    windowEndDateKey: endDateKey,
    points,
  };
}

export interface ForecastAccuracyAuditInput {
  tenantId: string | null;
  createdAt: Date;
  metadata: unknown;
}

function readNumericField(
  obj: Record<string, unknown>,
  key: string,
): number | null {
  const val = obj[key];
  if (typeof val === "number" && Number.isFinite(val)) {
    return val;
  }
  if (typeof val === "string" && val.trim().length > 0) {
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function extractWapePct(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const obj = metadata as Record<string, unknown>;
  const directPct = readNumericField(obj, "overallWapePct");
  if (directPct !== null) {
    return directPct;
  }
  const ratio = readNumericField(obj, "overallWape");
  if (ratio !== null) {
    return new Prisma.Decimal(ratio).mul(100).toNumber();
  }
  return null;
}

export function aggregateTenantWape(
  tenants: Array<{ id: string; code: string; name: string; nameAr: string }>,
  auditRows: ForecastAccuracyAuditInput[],
  thresholdPct: number = WAPE_ALERT_THRESHOLD_PCT,
): TenantWapeSummary[] {
  const grouped = new Map<
    string,
    { sumPct: Prisma.Decimal; count: number; latestAt: Date | null }
  >();

  for (const row of auditRows) {
    if (!row.tenantId) continue;
    const wapePct = extractWapePct(row.metadata);
    if (wapePct === null) continue;

    const existing = grouped.get(row.tenantId);
    if (!existing) {
      grouped.set(row.tenantId, {
        sumPct: new Prisma.Decimal(wapePct),
        count: 1,
        latestAt: row.createdAt,
      });
    } else {
      existing.sumPct = existing.sumPct.add(new Prisma.Decimal(wapePct));
      existing.count += 1;
      if (!existing.latestAt || row.createdAt > existing.latestAt) {
        existing.latestAt = row.createdAt;
      }
    }
  }

  return tenants
    .map((tenant): TenantWapeSummary => {
      const bucket = grouped.get(tenant.id);
      if (!bucket || bucket.count === 0) {
        return {
          tenantId: tenant.id,
          code: tenant.code,
          name: tenant.name,
          nameAr: tenant.nameAr,
          averageWapePct: null,
          evaluationCount: 0,
          latestEvaluatedAt: null,
          flaggedHighWape: false,
        };
      }

      const avg = bucket.sumPct
        .div(bucket.count)
        .toDecimalPlaces(1)
        .toNumber();
      return {
        tenantId: tenant.id,
        code: tenant.code,
        name: tenant.name,
        nameAr: tenant.nameAr,
        averageWapePct: avg,
        evaluationCount: bucket.count,
        latestEvaluatedAt: bucket.latestAt?.toISOString() ?? null,
        flaggedHighWape: avg > thresholdPct,
      };
    })
    .sort((a, b) => {
      if (a.flaggedHighWape !== b.flaggedHighWape) {
        return a.flaggedHighWape ? -1 : 1;
      }
      if (a.averageWapePct !== null && b.averageWapePct !== null) {
        return b.averageWapePct - a.averageWapePct;
      }
      if (a.averageWapePct !== null) return -1;
      if (b.averageWapePct !== null) return 1;
      return a.code.localeCompare(b.code);
    });
}

export interface CronAuditRecordInput {
  action: string;
  createdAt: Date;
  metadata: unknown;
}

function parseScheduledSummary(
  job: CronJobKey,
  row: CronAuditRecordInput | null,
): CronJobRunSummary {
  if (!row) {
    return {
      job,
      lastRunAt: null,
      status: "NEVER_RUN",
      tenantCount: null,
      tenantsSucceeded: null,
      tenantsFailed: null,
      totalEmailsSent: null,
    };
  }

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  if (job === "forecast") {
    return {
      job,
      lastRunAt: row.createdAt.toISOString(),
      status: "OK",
      tenantCount: null,
      tenantsSucceeded: null,
      tenantsFailed: null,
      totalEmailsSent: null,
    };
  }

  const tenantCount = readNumericField(meta, "tenantCount");
  const tenantsSucceeded = readNumericField(meta, "tenantsSucceeded");
  const tenantsFailed = readNumericField(meta, "tenantsFailed");
  const totalEmailsSent = readNumericField(meta, "totalEmailsSent");

  let status: CronRunStatus = "OK";
  if ((tenantsFailed ?? 0) > 0) {
    status =
      (tenantsSucceeded ?? 0) > 0 ? "PARTIAL" : "FAILED";
  }

  return {
    job,
    lastRunAt: row.createdAt.toISOString(),
    status,
    tenantCount,
    tenantsSucceeded,
    tenantsFailed,
    totalEmailsSent,
  };
}

export function summarizeCronJobLogs(
  latestByAction: Record<
    "CRON_DAILY_COMPLETED" | "CRON_WEEKLY_COMPLETED" | "CRON_MONTHLY_COMPLETED" | "FORECAST_RUN_COMPLETED",
    CronAuditRecordInput | null
  >,
): CronJobRunSummary[] {
  return [
    parseScheduledSummary("daily", latestByAction.CRON_DAILY_COMPLETED),
    parseScheduledSummary("weekly", latestByAction.CRON_WEEKLY_COMPLETED),
    parseScheduledSummary("monthly", latestByAction.CRON_MONTHLY_COMPLETED),
    parseScheduledSummary("forecast", latestByAction.FORECAST_RUN_COMPLETED),
  ];
}
