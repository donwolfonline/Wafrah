import type { Prisma } from "@prisma/client";
import { toTimeZoneDateKey } from "@/features/insights";
import { getMonthlyReportForTenant } from "@/features/reports";
import type { SessionUser } from "@/lib/authz";
import { getServerAppUrl } from "@/lib/app-url";
import { executeBudgetedCronTenantLoop } from "@/lib/cron-budget";
import { sendEmail } from "@/lib/email";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { logger } from "@/lib/logger";
import { createTenantDb } from "@/lib/tenant";
import {
  finalizePeriodicCronSummary,
  listDefaultRestaurants,
  type PeriodicCronDependencies,
  recordPeriodicTenantFailure,
  resolvePreviousMonthKey,
} from "./cron-helpers";
import { loadTenantManagerRecipients } from "./preferences";
import { renderMonthlyReportEmail } from "./templates-account";
import type { ScheduledCronSummary } from "./types";

export async function runMonthlyCronJob(
  now: Date = new Date(),
  yearMonthOverride?: string,
  deps?: PeriodicCronDependencies,
): Promise<ScheduledCronSummary> {
  const listRestaurants = deps?.listRestaurants ?? listDefaultRestaurants;
  const sendEmailFn = deps?.sendEmailFn ?? sendEmail;
  const getMonthlyReport = deps?.getMonthlyReport ?? getMonthlyReportForTenant;
  const resolvedAppUrl = getServerAppUrl(deps?.appUrl);

  const restaurants = await listRestaurants();
  const loopResult = await executeBudgetedCronTenantLoop({
    job: "monthly",
    auditAction: "CRON_MONTHLY_COMPLETED",
    tenants: restaurants,
    budget: deps,
    runTenant: async (tenant) => {
      const db = createTenantDb(tenant.id);
      const tz = tenant.timezone || RIYADH_TIME_ZONE;
      const targetMonth =
        yearMonthOverride ??
        resolvePreviousMonthKey(toTimeZoneDateKey(now, tz));
      const periodEntityId = `monthly:${targetMonth}`;

      const existing = await db.auditLog.findFirst({
        where: {
          action: "CRON_MONTHLY_TENANT_COMPLETED",
          entity: "CronJob",
          entityId: periodEntityId,
        },
        select: { id: true },
      });
      if (existing) {
        return {
          tenantId: tenant.id,
          tenantCode: tenant.code,
          status: "OK" as const,
          emailsSent: 0,
          alreadyCompleted: true,
        };
      }

      const recipients = await loadTenantManagerRecipients(
        tenant.id,
        "monthlyReport",
      );
      let emailsSent = 0;
      let lastError: string | undefined;

      if (recipients.length > 0) {
        const firstRecipient = recipients[0]!;
        const actorSession: SessionUser = {
          userId: firstRecipient.userId,
          tenantId: tenant.id,
          role: firstRecipient.role,
          locale: firstRecipient.locale,
        };
        const report = await getMonthlyReport(actorSession, targetMonth, {
          now,
        });

        for (const recipient of recipients) {
          const rendered = renderMonthlyReportEmail({
            locale: recipient.locale,
            restaurantName: tenant.name,
            restaurantNameAr: tenant.nameAr,
            yearMonth: report.yearMonth,
            outcome: report.savings.outcome,
            headlineAmountSar: report.savings.headlineAmountSar,
            calibratingDaysLeft: report.savings.calibratingDaysLeft,
            totalWasteSar: report.savings.current.totalWasteSar,
            appUrl: resolvedAppUrl,
          });
          const res = await sendEmailFn(
            recipient.email,
            rendered.subject,
            rendered.html,
            rendered.text,
          );
          if (res.ok) {
            emailsSent += 1;
          } else {
            lastError = res.error;
          }
        }

        if (emailsSent === 0) {
          throw new Error(lastError ?? "Failed to send monthly report emails");
        }
      }

      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "CRON_MONTHLY_TENANT_COMPLETED",
          entity: "CronJob",
          entityId: periodEntityId,
          metadata: {
            evaluatedAt: now.toISOString(),
            yearMonth: targetMonth,
            emailsSent,
          } satisfies Prisma.InputJsonObject,
        },
      });

      return {
        tenantId: tenant.id,
        tenantCode: tenant.code,
        status: "OK" as const,
        emailsSent,
      };
    },
    onTenantFailed: async (tenant, errorMsg) => {
      logger.error("cron.monthly.tenant_failed", {
        tenantId: tenant.id,
        tenantCode: tenant.code,
        error: errorMsg,
      });
      await recordPeriodicTenantFailure(tenant.id, "monthly", now, errorMsg);
      return {
        tenantId: tenant.id,
        tenantCode: tenant.code,
        status: "FAILED" as const,
        emailsSent: 0,
        error: errorMsg,
      };
    },
    onTenantSkipped: (tenant) => ({
      tenantId: tenant.id,
      tenantCode: tenant.code,
      status: "SKIPPED" as const,
      emailsSent: 0,
    }),
  });

  return finalizePeriodicCronSummary("monthly", now, loopResult.outcomes, {
    skippedTenantIds: loopResult.skippedTenantIds,
    stoppedEarlyByBudget: loopResult.stoppedEarlyByBudget,
    budgetMs: loopResult.budgetMs,
    recordSummaryAudit: deps?.recordSummaryAudit,
  });
}
