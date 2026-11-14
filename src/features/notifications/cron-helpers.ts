import type { Prisma } from "@prisma/client";
import type { getMonthlyReportForTenant } from "@/features/reports";
import {
  type CronExecutionBudgetOptions,
  recordCronSummaryAuditLog,
} from "@/lib/cron-budget";
import type { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { createTenantDb, platformAdminDb } from "@/lib/tenant";
import type { ScheduledCronSummary, TenantCronOutcome } from "./types";

export interface CronTenant {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  timezone: string;
}

export interface PeriodicCronDependencies extends CronExecutionBudgetOptions {
  listRestaurants?: () => Promise<CronTenant[]>;
  sendEmailFn?: typeof sendEmail;
  getMonthlyReport?: typeof getMonthlyReportForTenant;
  appUrl?: string;
}

export function resolvePreviousMonthKey(dateKey: string): string {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  if (month <= 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

export async function listDefaultRestaurants(): Promise<CronTenant[]> {
  return platformAdminDb.restaurant.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, code: true, name: true, nameAr: true, timezone: true },
  });
}

export async function recordPeriodicTenantFailure(
  tenantId: string,
  job: "weekly" | "monthly",
  now: Date,
  errorMsg: string,
): Promise<void> {
  try {
    const db = createTenantDb(tenantId);
    await db.auditLog.create({
      data: {
        tenantId,
        action:
          job === "weekly"
            ? "CRON_WEEKLY_TENANT_FAILED"
            : "CRON_MONTHLY_TENANT_FAILED",
        entity: "CronJob",
        entityId: job,
        metadata: {
          evaluatedAt: now.toISOString(),
          error: errorMsg,
        } satisfies Prisma.InputJsonObject,
      },
    });
  } catch {
    // Ignore secondary audit failure
  }
}

export async function finalizePeriodicCronSummary(
  job: "weekly" | "monthly",
  now: Date,
  tenants: TenantCronOutcome[],
  meta: {
    skippedTenantIds: string[];
    stoppedEarlyByBudget: boolean;
    budgetMs: number;
    recordSummaryAudit?: boolean;
  },
): Promise<ScheduledCronSummary> {
  const summary: ScheduledCronSummary = {
    job,
    evaluatedAt: now.toISOString(),
    tenantCount: tenants.length,
    tenantsSucceeded: tenants.filter((t) => t.status === "OK").length,
    tenantsFailed: tenants.filter((t) => t.status === "FAILED").length,
    tenantsSkipped: tenants.filter((t) => t.status === "SKIPPED").length,
    skippedTenantIds: meta.skippedTenantIds,
    stoppedEarlyByBudget: meta.stoppedEarlyByBudget,
    budgetMs: meta.budgetMs,
    totalEmailsSent: tenants.reduce((acc, t) => acc + t.emailsSent, 0),
    tenants,
  };

  logger.info(`cron.${job}.completed`, {
    evaluatedAt: summary.evaluatedAt,
    tenantCount: summary.tenantCount,
    tenantsSucceeded: summary.tenantsSucceeded,
    tenantsFailed: summary.tenantsFailed,
    tenantsSkipped: summary.tenantsSkipped,
    stoppedEarlyByBudget: summary.stoppedEarlyByBudget,
    totalEmailsSent: summary.totalEmailsSent,
  });

  if (meta.recordSummaryAudit !== false) {
    await recordCronSummaryAuditLog(
      job === "weekly" ? "CRON_WEEKLY_COMPLETED" : "CRON_MONTHLY_COMPLETED",
      job,
      summary as unknown as Prisma.InputJsonObject,
    );
  }

  return summary;
}
