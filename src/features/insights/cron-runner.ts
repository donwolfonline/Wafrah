import type { Prisma } from "@prisma/client";
import {
  type CronExecutionBudgetOptions,
  executeBudgetedCronTenantLoop,
  recordCronSummaryAuditLog,
} from "@/lib/cron-budget";
import { logger } from "@/lib/logger";
import { platformAdminDb } from "@/lib/tenant";
import {
  runInsightsForTenant,
  type AllTenantsInsightsSummary,
  type TenantInsightsResult,
} from "./service";

export interface InsightsCronDependencies extends CronExecutionBudgetOptions {
  listRestaurants?: () => Promise<Array<{ id: string }>>;
  runForTenant?: typeof runInsightsForTenant;
}

export async function runInsightsForAllTenants(
  now: Date = new Date(),
  deps?: InsightsCronDependencies,
): Promise<AllTenantsInsightsSummary> {
  const restaurants = await (deps?.listRestaurants ??
    (() =>
      platformAdminDb.restaurant.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })))();
  const runTenantFn = deps?.runForTenant ?? runInsightsForTenant;

  const loopResult = await executeBudgetedCronTenantLoop<
    { id: string },
    | { status: "OK"; result: TenantInsightsResult }
    | { status: "FAILED"; tenantId: string; error: string }
    | { status: "SKIPPED"; tenantId: string }
  >({
    job: "insights",
    auditAction: "CRON_INSIGHTS_COMPLETED",
    tenants: restaurants,
    budget: deps,
    runTenant: async (restaurant) => ({
      status: "OK",
      result: await runTenantFn(restaurant.id, now),
    }),
    onTenantFailed: (restaurant, error) => {
      logger.error("cron.insights.tenant_failed", {
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
      (outcome): outcome is { status: "OK"; result: TenantInsightsResult } =>
        outcome.status === "OK",
    )
    .map((outcome) => outcome.result);
  const failedTenants = loopResult.outcomes.filter(
    (
      outcome,
    ): outcome is { status: "FAILED"; tenantId: string; error: string } =>
      outcome.status === "FAILED",
  );

  const totalAlertsUpserted = tenants.reduce(
    (sum, t) => sum + t.persistedAlerts.length,
    0,
  );

  const summary: AllTenantsInsightsSummary = {
    evaluatedAt: now.toISOString(),
    tenantCount: tenants.length,
    tenantsFailed: failedTenants.length,
    tenantsSkipped: loopResult.skippedTenantIds.length,
    skippedTenantIds: loopResult.skippedTenantIds,
    stoppedEarlyByBudget: loopResult.stoppedEarlyByBudget,
    budgetMs: loopResult.budgetMs,
    totalAlertsUpserted,
    tenants,
  };

  if (deps?.recordSummaryAudit !== false) {
    await recordCronSummaryAuditLog("CRON_INSIGHTS_COMPLETED", "insights", {
      evaluatedAt: summary.evaluatedAt,
      tenantCount: restaurants.length,
      tenantsSucceeded: tenants.length,
      tenantsFailed: failedTenants.length,
      tenantsSkipped: loopResult.skippedTenantIds.length,
      skippedTenantIds: loopResult.skippedTenantIds,
      stoppedEarlyByBudget: loopResult.stoppedEarlyByBudget,
      budgetMs: loopResult.budgetMs,
      totalAlertsUpserted,
    } satisfies Prisma.InputJsonObject);
  }

  return summary;
}
