import type { Prisma } from "@prisma/client";
import { runForecastsForTenant } from "@/features/forecast";
import { runInsightsForTenant, toTimeZoneDateKey } from "@/features/insights";
import { sendEmail, type EmailSendResult } from "@/lib/email";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { createTenantDb, platformAdminDb } from "@/lib/tenant";
import { loadTenantManagerRecipients } from "./preferences";
import { renderCriticalAlertEmail } from "./templates";
import type { ScheduledCronSummary, TenantCronOutcome } from "./types";

export interface DailyCronDependencies {
  listRestaurants?: () => Promise<
    Array<{ id: string; code: string; name: string; nameAr: string; timezone: string }>
  >;
  runInsights?: typeof runInsightsForTenant;
  runForecasts?: typeof runForecastsForTenant;
  sendEmailFn?: typeof sendEmail;
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
  const resolvedAppUrl = appUrl ?? process.env.APP_URL ?? "http://localhost:3000";

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
 * isolating errors per tenant and logging an AuditLog summary row.
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
  const tenants: TenantCronOutcome[] = [];

  for (const tenant of restaurants) {
    try {
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

      tenants.push({
        tenantId: tenant.id,
        tenantCode: tenant.code,
        status: "OK",
        emailsSent: delivery.emailsSent,
        alertsNotified: delivery.alertsNotified,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[cron:daily] Tenant ${tenant.code} failed: ${errorMsg}`);
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

      tenants.push({
        tenantId: tenant.id,
        tenantCode: tenant.code,
        status: "FAILED",
        emailsSent: 0,
        alertsNotified: 0,
        error: errorMsg,
      });
    }
  }

  const summary: ScheduledCronSummary = {
    job: "daily",
    evaluatedAt: now.toISOString(),
    tenantCount: tenants.length,
    tenantsSucceeded: tenants.filter((t) => t.status === "OK").length,
    tenantsFailed: tenants.filter((t) => t.status === "FAILED").length,
    totalEmailsSent: tenants.reduce((acc, t) => acc + t.emailsSent, 0),
    tenants,
  };

  console.info(
    `[cron:daily] Summary evaluatedAt=${summary.evaluatedAt} succeeded=${summary.tenantsSucceeded}/${summary.tenantCount} failed=${summary.tenantsFailed} emailsSent=${summary.totalEmailsSent}`,
  );

  await platformAdminDb.auditLog.create({
    data: {
      tenantId: null,
      action: "CRON_DAILY_COMPLETED",
      entity: "CronJob",
      entityId: "daily",
      metadata: summary as unknown as Prisma.InputJsonObject,
    },
  });

  return summary;
}
