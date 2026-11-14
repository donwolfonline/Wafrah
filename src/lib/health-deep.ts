import { platformAdminDb } from "@/lib/db";
import type { CronCompletionAction } from "@/lib/cron-budget";

/**
 * Daily cron runs every 24h (`0 0 * * *` UTC). Allow 26h to cover Vercel Hobby's
 * per-hour execution window (+/- 59 minutes) plus a 1-hour safety margin.
 * https://vercel.com/docs/cron-jobs/usage-and-pricing
 */
export const CRON_DEEP_HEALTH_MAX_AGE_MS = 26 * 60 * 60 * 1000;

export interface DeepHealthEvaluation {
  healthy: boolean;
  db: {
    status: "up" | "down";
    latencyMs: number;
  };
  cron: {
    status: "ok" | "missing" | "stale";
    action: CronCompletionAction;
    lastSuccessAt: string | null;
    ageMinutes: number | null;
    maxAgeMinutes: number;
  };
}

export function isSuccessfulCronSummaryMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") {
    return true;
  }
  const record = metadata as Record<string, unknown>;
  const tenantCount =
    typeof record.tenantCount === "number" ? record.tenantCount : null;
  const tenantsSucceeded =
    typeof record.tenantsSucceeded === "number" ? record.tenantsSucceeded : null;
  const tenantsFailed =
    typeof record.tenantsFailed === "number" ? record.tenantsFailed : null;

  if (
    tenantCount !== null &&
    tenantCount > 0 &&
    tenantsSucceeded === 0 &&
    tenantsFailed !== null &&
    tenantsFailed > 0
  ) {
    return false;
  }

  return true;
}

export function evaluateDeepHealthStatus(input: {
  dbOk: boolean;
  dbLatencyMs: number;
  lastSuccessAt: Date | null;
  now?: Date;
  maxAgeMs?: number;
  action?: CronCompletionAction;
}): DeepHealthEvaluation {
  const now = input.now ?? new Date();
  const maxAgeMs = input.maxAgeMs ?? CRON_DEEP_HEALTH_MAX_AGE_MS;
  const maxAgeMinutes = Math.round(maxAgeMs / 60_000);
  const action = input.action ?? "CRON_DAILY_COMPLETED";

  if (!input.lastSuccessAt) {
    return {
      healthy: false,
      db: {
        status: input.dbOk ? "up" : "down",
        latencyMs: input.dbLatencyMs,
      },
      cron: {
        status: "missing",
        action,
        lastSuccessAt: null,
        ageMinutes: null,
        maxAgeMinutes,
      },
    };
  }

  const ageMs = Math.max(0, now.getTime() - input.lastSuccessAt.getTime());
  const ageMinutes = Math.round(ageMs / 60_000);
  const isFresh = ageMs <= maxAgeMs;

  return {
    healthy: input.dbOk && isFresh,
    db: {
      status: input.dbOk ? "up" : "down",
      latencyMs: input.dbLatencyMs,
    },
    cron: {
      status: isFresh ? "ok" : "stale",
      action,
      lastSuccessAt: input.lastSuccessAt.toISOString(),
      ageMinutes,
      maxAgeMinutes,
    },
  };
}

export async function runDeepHealthCheck(
  now: Date = new Date(),
  maxAgeMs: number = CRON_DEEP_HEALTH_MAX_AGE_MS,
): Promise<DeepHealthEvaluation> {
  const startedAt = Date.now();
  let dbOk = false;
  let lastSuccessAt: Date | null = null;

  try {
    await platformAdminDb.$queryRaw`SELECT 1`;
    dbOk = true;

    const recentLogs = await platformAdminDb.auditLog.findMany({
      where: {
        tenantId: null,
        entity: "CronJob",
        action: "CRON_DAILY_COMPLETED",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        createdAt: true,
        metadata: true,
      },
    });

    const latestSuccess = recentLogs.find((row) =>
      isSuccessfulCronSummaryMetadata(row.metadata),
    );
    lastSuccessAt = latestSuccess?.createdAt ?? null;
  } catch {
    dbOk = false;
  }

  const dbLatencyMs = Math.max(0, Date.now() - startedAt);
  return evaluateDeepHealthStatus({
    dbOk,
    dbLatencyMs,
    lastSuccessAt,
    now,
    maxAgeMs,
    action: "CRON_DAILY_COMPLETED",
  });
}
