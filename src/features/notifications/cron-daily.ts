import type { Prisma } from "@prisma/client";
import { runForecastsForTenant } from "@/features/forecast";
import { runInsightsForTenant, toTimeZoneDateKey } from "@/features/insights";
import { getServerAppUrl } from "@/lib/app-url";
import {
  type CronExecutionBudgetOptions,
  executeBudgetedCronTenantLoop,
  recordCronSummaryAuditLog,
} from "@/lib/cron-budget";
import { sendEmail, type EmailSendResult } from "@/lib/email";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { logger } from "@/lib/logger";
import { cleanupExpiredRateLimitBuckets } from "@/lib/rate-limit-store";
import { createTenantDb, platformAdminDb } from "@/lib/tenant";
import { loadTenantManagerRecipients } from "./preferences";
import { renderCriticalAlertEmail } from "./templates";
import type { ScheduledCronSummary } from "./types";

export interface DailyCronDependencies extends CronExecutionBudgetOptions {
  listRestaurants?: () => Promise<
    Array<{ id: string; code: string; name: string; nameAr: string; timezone: string }>
  >;
  runInsights?: typeof runInsightsForTenant;
  runForecasts?: typeof runForecastsForTenant;
  sendEmailFn?: typeof sendEmail;
  cleanupRateLimitBuckets?: typeof cleanupExpiredRateLimitBuckets;
  appUrl?: string;
}

/**
 * Finds unnotified `CRITICAL` alerts for a single tenant, sends localized emails
 * per eligible manager's locale and preferences, and stamps `notifiedAt` so the
 * same `Alert.dedupeKey` is never emailed twice.
 */
export async function deliverCriticalAlertsForTenant(
  tenant: {
    id: string;
    code: string;
    name: string;
    nameAr: string;
    timezone: string;
  },
  now: Date,
  sendEmailFn: typeof sendEmail = sendEmail,
  appUrl?: string,
): Promise<{ alertsNotified: number; emailsSent: number }> {
  const db = createTenantDb(tenant.id);
  const pendingAlerts = await db.alert.findMany({
    where: {
      severity: "CRITICAL",
      notifiedAt: null,
      status: { not: "DISMISSED" },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      severity: true,
      messageKey: true,
      messageParams: true,
      createdAt: true,
    },
  });

  if (pendingAlerts.length === 0) {
    return { alertsNotified: 0, emailsSent: 0 };
  }

  const recipients = await loadTenantManagerRecipients(
    tenant.id,
    "criticalAlerts",
  );
  if (recipients.length === 0) {
    return { alertsNotified: 0, emailsSent: 0 };
  }

  const tz = tenant.timezone || RIYADH_TIME_ZONE;
  const dateKey = toTimeZoneDateKey(now, tz);
  const resolvedAppUrl = getServerAppUrl(appUrl);

  const alertsPayload = pendingAlerts.map((a) => ({
    id: a.id,
    severity: a.severity,
    messageKey: a.messageKey,
    messageParams:
      a.messageParams && typeof a.messageParams === "object"
        ? (a.messageParams as Record<string, unknown>)
        : {},
    createdAtIso: a.createdAt.toISOString(),
  }));

  const cacheByLocale = new Map<"ar" | "en", ReturnType<typeof renderCriticalAlertEmail>>();
  let emailsSent = 0;
  let lastError: string | undefined;

  for (const recipient of recipients) {
    let rendered = cacheByLocale.get(recipient.locale);
    if (!rendered) {
      rendered = renderCriticalAlertEmail({
        locale: recipient.locale,
        restaurantName: tenant.name,
        restaurantNameAr: tenant.nameAr,
        dateKey,
        alerts: alertsPayload,
        appUrl: resolvedAppUrl,
      });
      cacheByLocale.set(recipient.locale, rendered);
    }

    const result: EmailSendResult = await sendEmailFn(
      recipient.email,
      rendered.subject,
      rendered.html,
      rendered.text,
    );
    if (result.ok) {
      emailsSent += 1;
    } else {
      lastError = result.error;
    }
  }

  if (emailsSent === 0) {
    throw new Error(lastError ?? "Failed to send critical alert emails");
  }

  const updated = await db.alert.updateMany({
    where: {
      id: { in: pendingAlerts.map((a) => a.id) },
      notifiedAt: null,
    },
    data: { notifiedAt: now },
  });

  return { alertsNotified: updated.count, emailsSent };
}

/**
 * Daily cron orchestrator: insights -> forecast -> critical alert emails,
 * prioritizing previously skipped tenants first, isolating errors per tenant,
 * stopping before Vercel timeout (~80% budget), and logging an AuditLog summary.
 */
export async function runDailyCronJob(
  now: Date = new Date(),
  deps?: DailyCronDependencies,
): Promise<ScheduledCronSummary> {
  const listRestaurants =
    deps?.listRestaurants ??
    (() =>
      platformAdminDb.restaurant.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, code: true, name: true, nameAr: true, timezone: true },
      }));
  const runInsights = deps?.runInsights ?? runInsightsForTenant;
  const runForecasts = deps?.runForecasts ?? runForecastsForTenant;
  const sendEmailFn = deps?.sendEmailFn ?? sendEmail;

  const restaurants = await listRestaurants();
  const loopResult = await executeBudgetedCronTenantLoop({
    job: "daily",
    auditAction: "CRON_DAILY_COMPLETED",
    tenants: restaurants,
    budget: deps,
    runTenant: async (tenant) => {
      await runInsights(tenant.id, now);
      await runForecasts(tenant.id, now);
      const delivery = await deliverCriticalAlertsForTenant(
        tenant,
        now,
        sendEmailFn,
        deps?.appUrl,
      );

      const tenantDb = createTenantDb(tenant.id);
      await tenantDb.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "CRON_DAILY_TENANT_COMPLETED",
          entity: "CronJob",
          entityId: "daily",
          metadata: {
            evaluatedAt: now.toISOString(),
            alertsNotified: delivery.alertsNotified,
            emailsSent: delivery.emailsSent,
          } satisfies Prisma.InputJsonObject,
        },
      });

      return {
        tenantId: tenant.id,
        tenantCode: tenant.code,
        status: "OK" as const,
        emailsSent: delivery.emailsSent,
        alertsNotified: delivery.alertsNotified,
      };
    },
    onTenantFailed: async (tenant, errorMsg) => {
      logger.error("cron.daily.tenant_failed", {
        tenantId: tenant.id,
        tenantCode: tenant.code,
        error: errorMsg,
      });
      try {
        const tenantDb = createTenantDb(tenant.id);
        await tenantDb.auditLog.create({
          data: {
            tenantId: tenant.id,
            action: "CRON_DAILY_TENANT_FAILED",
            entity: "CronJob",
            entityId: "daily",
            metadata: {
              evaluatedAt: now.toISOString(),
              error: errorMsg,
            } satisfies Prisma.InputJsonObject,
          },
        });
      } catch {
        // Ignore secondary audit failure
      }

      return {
        tenantId: tenant.id,
        tenantCode: tenant.code,
        status: "FAILED" as const,
        emailsSent: 0,
        alertsNotified: 0,
        error: errorMsg,
      };
    },
    onTenantSkipped: (tenant) => ({
      tenantId: tenant.id,
      tenantCode: tenant.code,
      status: "SKIPPED" as const,
      emailsSent: 0,
      alertsNotified: 0,
    }),
  });

  const tenants = loopResult.outcomes;

  const cleanupRateLimits =
    deps?.cleanupRateLimitBuckets ?? cleanupExpiredRateLimitBuckets;
  let rateLimitBucketsCleaned = 0;
  try {
    rateLimitBucketsCleaned = await cleanupRateLimits(now);
  } catch (error) {
    logger.warn("cron.daily.rate_limit_cleanup_failed", { error });
  }

  const summary: ScheduledCronSummary = {
    job: "daily",
    evaluatedAt: now.toISOString(),
    tenantCount: tenants.length,
    tenantsSucceeded: tenants.filter((t) => t.status === "OK").length,
    tenantsFailed: tenants.filter((t) => t.status === "FAILED").length,
    tenantsSkipped: tenants.filter((t) => t.status === "SKIPPED").length,
    skippedTenantIds: loopResult.skippedTenantIds,
    stoppedEarlyByBudget: loopResult.stoppedEarlyByBudget,
    budgetMs: loopResult.budgetMs,
    totalEmailsSent: tenants.reduce((acc, t) => acc + t.emailsSent, 0),
    tenants,
    rateLimitBucketsCleaned,
  };

  logger.info("cron.daily.completed", {
    evaluatedAt: summary.evaluatedAt,
    tenantCount: summary.tenantCount,
    tenantsSucceeded: summary.tenantsSucceeded,
    tenantsFailed: summary.tenantsFailed,
    tenantsSkipped: summary.tenantsSkipped,
    stoppedEarlyByBudget: summary.stoppedEarlyByBudget,
    totalEmailsSent: summary.totalEmailsSent,
    rateLimitBucketsCleaned,
  });

  if (deps?.recordSummaryAudit !== false) {
    await recordCronSummaryAuditLog(
      "CRON_DAILY_COMPLETED",
      "daily",
      summary as unknown as Prisma.InputJsonObject,
    );
  }

  return summary;
}
