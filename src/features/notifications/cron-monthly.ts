import type { Prisma } from "@prisma/client";
import { toTimeZoneDateKey } from "@/features/insights";
import { getMonthlyReportForTenant } from "@/features/reports";
import type { SessionUser } from "@/lib/authz";
import { sendEmail } from "@/lib/email";
import { RIYADH_TIME_ZONE } from "@/lib/format";
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
import type { ScheduledCronSummary, TenantCronOutcome } from "./types";

export async function runMonthlyCronJob(
  now: Date = new Date(),
  yearMonthOverride?: string,
  deps?: PeriodicCronDependencies,
): Promise<ScheduledCronSummary> {
  const listRestaurants = deps?.listRestaurants ?? listDefaultRestaurants;
  const sendEmailFn = deps?.sendEmailFn ?? sendEmail;
  const getMonthlyReport = deps?.getMonthlyReport ?? getMonthlyReportForTenant;
  const resolvedAppUrl =
    deps?.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";

  const restaurants = await listRestaurants();
  const tenants: TenantCronOutcome[] = [];

  for (const tenant of restaurants) {
    try {
      const recipients = await loadTenantManagerRecipients(
        tenant.id,
        "monthlyReport",
      );
      let emailsSent = 0;

      if (recipients.length > 0) {
        const tz = tenant.timezone || RIYADH_TIME_ZONE;
        const targetMonth =
          yearMonthOverride ??
          resolvePreviousMonthKey(toTimeZoneDateKey(now, tz));
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
          if (res.ok) emailsSent += 1;
        }
      }

      const db = createTenantDb(tenant.id);
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "CRON_MONTHLY_TENANT_COMPLETED",
          entity: "CronJob",
          entityId: "monthly",
          metadata: {
            evaluatedAt: now.toISOString(),
            emailsSent,
          } satisfies Prisma.InputJsonObject,
        },
      });

      tenants.push({
        tenantId: tenant.id,
        tenantCode: tenant.code,
        status: "OK",
        emailsSent,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[cron:monthly] Tenant ${tenant.code} failed: ${errorMsg}`);
      await recordPeriodicTenantFailure(tenant.id, "monthly", now, errorMsg);
      tenants.push({
        tenantId: tenant.id,
        tenantCode: tenant.code,
        status: "FAILED",
        emailsSent: 0,
        error: errorMsg,
      });
    }
  }

  return finalizePeriodicCronSummary("monthly", now, tenants);
}
