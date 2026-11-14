import type { Prisma } from "@prisma/client";
import {
  type CronExecutionBudgetOptions,
  executeBudgetedCronTenantLoop,
  recordCronSummaryAuditLog,
} from "@/lib/cron-budget";
import { logger } from "@/lib/logger";
import { platformAdminDb } from "@/lib/tenant";
import {
  runForecastsForTenant,
  type AllTenantsForecastSummary,
  type TenantForecastRunResult,
} from "./service";
import { StatisticalForecaster } from "./statistical-forecaster";
import type { DemandForecaster } from "./types";

export interface ForecastCronDependencies extends CronExecutionBudgetOptions {
  listRestaurants?: () => Promise<Array<{ id: string }>>;
  runForTenant?: typeof runForecastsForTenant;
}

export async function runForecastsForAllTenants(
  now: Date = new Date(),
  forecaster: DemandForecaster = new StatisticalForecaster(),
  deps?: ForecastCronDependencies,
): Promise<AllTenantsForecastSummary> {
  const restaurants = await (deps?.listRestaurants ??
    (() =>
      platformAdminDb.restaurant.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })))();
  const runTenantFn = deps?.runForTenant ?? runForecastsForTenant;

  const loopResult = await executeBudgetedCronTenantLoop<
    { id: string },
    | { status: "OK"; result: TenantForecastRunResult }
    | { status: "FAILED"; tenantId: string; error: string }
    | { status: "SKIPPED"; tenantId: string }
  >({
    job: "forecast",
    auditAction: "CRON_FORECAST_COMPLETED",
    tenants: restaurants,
    budget: deps,
    runTenant: async (restaurant) => ({
      status: "OK",
      result: await runTenantFn(restaurant.id, now, forecaster),
    }),
    onTenantFailed: (restaurant, error) => {
      logger.error("cron.forecast.tenant_failed", {
        tenantId: restaurant.id,
        error,
      });
      return { status: "FAILED", tenantId: restaurant.id, error };
    },
    onTenantSkipped: (restaurant) => ({
      status: "SKIPPED",
      tenantId: restaurant.id,
    }),
  });

  const tenants = loopResult.outcomes
    .filter(
      (outcome): outcome is { status: "OK"; result: TenantForecastRunResult } =>
        outcome.status === "OK",
    )
    .map((outcome) => outcome.result);
  const failedTenants = loopResult.outcomes.filter(
    (
      outcome,
    ): outcome is { status: "FAILED"; tenantId: string; error: string } =>
      outcome.status === "FAILED",
  );

  const totalPersistedRows = tenants.reduce(
    (sum, tenant) => sum + tenant.persistedRows,
    0,
  );

  const summary: AllTenantsForecastSummary = {
    evaluatedAt: now.toISOString(),
    tenantCount: tenants.length,
    tenantsFailed: failedTenants.length,
    tenantsSkipped: loopResult.skippedTenantIds.length,
    skippedTenantIds: loopResult.skippedTenantIds,
    stoppedEarlyByBudget: loopResult.stoppedEarlyByBudget,
    budgetMs: loopResult.budgetMs,
    totalPersistedRows,
    tenants,
  };

  if (deps?.recordSummaryAudit !== false) {
    await recordCronSummaryAuditLog("CRON_FORECAST_COMPLETED", "forecast", {
      evaluatedAt: summary.evaluatedAt,
      tenantCount: restaurants.length,
      tenantsSucceeded: tenants.length,
      tenantsFailed: failedTenants.length,
      tenantsSkipped: loopResult.skippedTenantIds.length,
      skippedTenantIds: loopResult.skippedTenantIds,
      stoppedEarlyByBudget: loopResult.stoppedEarlyByBudget,
      budgetMs: loopResult.budgetMs,
      totalPersistedRows,
    } satisfies Prisma.InputJsonObject);
  }

  return summary;
}
