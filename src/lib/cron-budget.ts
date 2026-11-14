import type { Prisma } from "@prisma/client";
import { platformAdminDb } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Vercel Function `maxDuration` cap configured on cron route handlers.
 * Vercel Fluid Compute provides 300s max on Hobby (300s default / 800s max on Pro):
 * https://vercel.com/docs/functions/configuring-functions/duration
 */
export const CRON_MAX_DURATION_SECONDS = 300;

/**
 * Reserve 20% headroom before Vercel's function timeout so rate-limit cleanup
 * and AuditLog persistence always finish before the platform aborts execution.
 */
export const CRON_TIME_BUDGET_RATIO = 0.8;

export type CronCompletionAction =
  | "CRON_DAILY_COMPLETED"
  | "CRON_WEEKLY_COMPLETED"
  | "CRON_MONTHLY_COMPLETED"
  | "CRON_FORECAST_COMPLETED"
  | "CRON_INSIGHTS_COMPLETED";

export interface CronExecutionBudgetOptions {
  maxDurationSeconds?: number;
  budgetMs?: number;
  nowMs?: () => number;
  prioritizeTenantIds?: readonly string[];
  loadSkippedTenantIds?: () => Promise<string[]>;
  recordSummaryAudit?: boolean;
}

export interface BudgetedCronLoopResult<TOutcome> {
  outcomes: TOutcome[];
  skippedTenantIds: string[];
  stoppedEarlyByBudget: boolean;
  budgetMs: number;
  elapsedMs: number;
}

export function computeCronBudgetMs(
  maxDurationSeconds: number = CRON_MAX_DURATION_SECONDS,
  budgetRatio: number = CRON_TIME_BUDGET_RATIO,
): number {
  if (!Number.isFinite(maxDurationSeconds) || !Number.isFinite(budgetRatio)) {
    return Math.floor(CRON_MAX_DURATION_SECONDS * 1000 * CRON_TIME_BUDGET_RATIO);
  }
  return Math.max(0, Math.floor(maxDurationSeconds * 1000 * budgetRatio));
}

export function isCronBudgetExceeded(
  startedAtMs: number,
  budgetMs: number,
  currentMs: number = Date.now(),
): boolean {
  return currentMs - startedAtMs >= budgetMs;
}

export function extractSkippedTenantIds(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }
  const raw = (metadata as { skippedTenantIds?: unknown }).skippedTenantIds;
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
  }
  return result;
}

/**
 * Reorders tenants so any tenant skipped by an earlier run's time budget is
 * picked up first, in its prior skipped order, followed by the remaining tenants.
 */
export function prioritizeTenantsBySkippedIds<T extends { id: string }>(
  tenants: readonly T[],
  previouslySkippedIds: readonly string[],
): T[] {
  if (previouslySkippedIds.length === 0 || tenants.length <= 1) {
    return [...tenants];
  }

  const byId = new Map<string, T>();
  for (const tenant of tenants) {
    byId.set(tenant.id, tenant);
  }

  const ordered: T[] = [];
  const addedIds = new Set<string>();

  for (const skippedId of previouslySkippedIds) {
    const match = byId.get(skippedId);
    if (match && !addedIds.has(match.id)) {
      ordered.push(match);
      addedIds.add(match.id);
    }
  }

  for (const tenant of tenants) {
    if (!addedIds.has(tenant.id)) {
      ordered.push(tenant);
    }
  }

  return ordered;
}

/**
 * Maps a `YYYY-MM-DD` date key (evaluated in the tenant's business timezone)
 * to the Sunday `YYYY-MM-DD` starting its Saudi business week.
 */
export function resolveSundayWeekKey(dateKey: string): string {
  const base = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(base.getTime())) {
    return dateKey;
  }
  const dayOfWeek = base.getUTCDay();
  base.setUTCDate(base.getUTCDate() - dayOfWeek);
  return base.toISOString().slice(0, 10);
}

export async function loadPreviousSkippedTenantIds(
  action: CronCompletionAction,
): Promise<string[]> {
  try {
    const latest = await platformAdminDb.auditLog.findFirst({
      where: {
        tenantId: null,
        action,
        entity: "CronJob",
      },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    return extractSkippedTenantIds(latest?.metadata);
  } catch (error) {
    logger.warn("cron.budget.load_skipped_failed", { action, error });
    return [];
  }
}

export async function recordCronSummaryAuditLog(
  action: CronCompletionAction,
  entityId: string,
  metadata: Prisma.InputJsonObject,
): Promise<void> {
  await platformAdminDb.auditLog.create({
    data: {
      tenantId: null,
      action,
      entity: "CronJob",
      entityId,
      metadata,
    },
  });
}

/**
 * Executes a tenant-by-tenant cron loop respecting the ~80% duration budget,
 * prioritizing previously skipped tenants first, isolating per-tenant failures,
 * and recording remaining skipped tenant IDs when stopped early.
 */
export async function executeBudgetedCronTenantLoop<
  TTenant extends { id: string; code?: string },
  TOk,
  TFailed = TOk,
  TSkipped = TOk,
>(input: {
  job: string;
  auditAction: CronCompletionAction;
  tenants: readonly TTenant[];
  budget?: CronExecutionBudgetOptions;
  runTenant: (tenant: TTenant) => Promise<TOk>;
  onTenantFailed: (tenant: TTenant, errorMsg: string) => Promise<TFailed> | TFailed;
  onTenantSkipped: (tenant: TTenant) => TSkipped;
}): Promise<BudgetedCronLoopResult<TOk | TFailed | TSkipped>> {
  const previouslySkippedIds = input.budget?.prioritizeTenantIds
    ? [...input.budget.prioritizeTenantIds]
    : input.budget?.loadSkippedTenantIds
      ? await input.budget.loadSkippedTenantIds()
      : await loadPreviousSkippedTenantIds(input.auditAction);

  const orderedTenants = prioritizeTenantsBySkippedIds(
    input.tenants,
    previouslySkippedIds,
  );
  const nowMs = input.budget?.nowMs ?? Date.now;
  const startedAtMs = nowMs();
  const budgetMs =
    input.budget?.budgetMs ??
    computeCronBudgetMs(input.budget?.maxDurationSeconds);

  const outcomes: Array<TOk | TFailed | TSkipped> = [];
  const skippedTenantIds: string[] = [];
  let stoppedEarlyByBudget = false;

  for (let i = 0; i < orderedTenants.length; i += 1) {
    const currentMs = nowMs();
    if (isCronBudgetExceeded(startedAtMs, budgetMs, currentMs)) {
      const remaining = orderedTenants.slice(i);
      for (const skipped of remaining) {
        skippedTenantIds.push(skipped.id);
        outcomes.push(input.onTenantSkipped(skipped));
      }
      stoppedEarlyByBudget = true;
      logger.warn(`cron.${input.job}.budget_stopped_early`, {
        elapsedMs: currentMs - startedAtMs,
        budgetMs,
        processedCount: i,
        skippedCount: skippedTenantIds.length,
        skippedTenantIds,
      });
      break;
    }

    const tenant = orderedTenants[i]!;
    try {
      outcomes.push(await input.runTenant(tenant));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      outcomes.push(await input.onTenantFailed(tenant, errorMsg));
    }
  }

  return {
    outcomes,
    skippedTenantIds,
    stoppedEarlyByBudget,
    budgetMs,
    elapsedMs: Math.max(0, nowMs() - startedAtMs),
  };
}
