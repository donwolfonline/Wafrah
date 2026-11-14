import type { Prisma } from "@prisma/client";
import { shiftDateKey, toTimeZoneDateKey } from "@/features/insights";
import { toDecimal } from "@/features/insights/math";
import { getServerAppUrl } from "@/lib/app-url";
import {
  executeBudgetedCronTenantLoop,
  resolveSundayWeekKey,
} from "@/lib/cron-budget";
import { sendEmail } from "@/lib/email";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { logger } from "@/lib/logger";
import { createTenantDb } from "@/lib/tenant";
import {
  finalizePeriodicCronSummary,
  listDefaultRestaurants,
  type PeriodicCronDependencies,
  recordPeriodicTenantFailure,
} from "./cron-helpers";
import { loadTenantManagerRecipients } from "./preferences";
import { renderWeeklySummaryEmail } from "./templates";
import type {
  ScheduledCronSummary,
  WeeklyRecommendationRow,
} from "./types";

export async function runWeeklyCronJob(
  now: Date = new Date(),
  deps?: PeriodicCronDependencies,
): Promise<ScheduledCronSummary> {
  const listRestaurants = deps?.listRestaurants ?? listDefaultRestaurants;
  const sendEmailFn = deps?.sendEmailFn ?? sendEmail;
  const resolvedAppUrl = getServerAppUrl(deps?.appUrl);

  const restaurants = await listRestaurants();
  const loopResult = await executeBudgetedCronTenantLoop({
    job: "weekly",
    auditAction: "CRON_WEEKLY_COMPLETED",
    tenants: restaurants,
    budget: deps,
    runTenant: async (tenant) => {
      const db = createTenantDb(tenant.id);
      const tz = tenant.timezone || RIYADH_TIME_ZONE;
      const todayKey = toTimeZoneDateKey(now, tz);
      const weekKey = resolveSundayWeekKey(todayKey);
      const periodEntityId = `weekly:${weekKey}`;

      const existing = await db.auditLog.findFirst({
        where: {
          action: "CRON_WEEKLY_TENANT_COMPLETED",
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
        "weeklySummary",
      );
      let emailsSent = 0;
      let lastError: string | undefined;
      const horizonEnd = shiftDateKey(todayKey, 6);

      if (recipients.length > 0) {
        const wasteStartKey = shiftDateKey(todayKey, -7);

        const [forecastRows, recentWasteRows] = await Promise.all([
          db.forecastResult.findMany({
            where: {
              forDate: {
                gte: new Date(`${todayKey}T00:00:00.000Z`),
                lte: new Date(`${horizonEnd}T00:00:00.000Z`),
              },
            },
            include: {
              menuItem: {
                select: { name: true, nameAr: true, unit: true },
              },
            },
          }),
          db.wasteEntry.findMany({
            where: {
              deletedAt: null,
              occurredAt: {
                gte: new Date(`${wasteStartKey}T00:00:00.000Z`),
              },
            },
            include: { menuItem: { select: { unitCost: true } } },
          }),
        ]);

        const byItem = new Map<
          string,
          {
            name: string;
            nameAr: string;
            unit: string;
            sum: Prisma.Decimal;
            days: number;
          }
        >();
        for (const f of forecastRows) {
          const entry = byItem.get(f.menuItemId) ?? {
            name: f.menuItem.name,
            nameAr: f.menuItem.nameAr,
            unit: f.menuItem.unit,
            sum: toDecimal(0),
            days: 0,
          };
          entry.sum = entry.sum.plus(f.recommendedQty);
          entry.days += 1;
          byItem.set(f.menuItemId, entry);
        }

        const topRecommendations: WeeklyRecommendationRow[] = Array.from(
          byItem.values(),
        )
          .sort((a, b) => b.sum.cmp(a.sum))
          .slice(0, 5)
          .map((item) => ({
            itemName: item.name,
            itemNameAr: item.nameAr,
            unit: item.unit,
            totalRecommendedQty: item.sum.toDecimalPlaces(1).toString(),
            dailyAvgQty: item.sum
              .div(Math.max(1, item.days))
              .toDecimalPlaces(1)
              .toString(),
          }));

        const wasteTotal = recentWasteRows.reduce(
          (acc, w) => acc.plus(toDecimal(w.quantity).mul(w.menuItem.unitCost)),
          toDecimal(0),
        );

        for (const recipient of recipients) {
          const rendered = renderWeeklySummaryEmail({
            locale: recipient.locale,
            restaurantName: tenant.name,
            restaurantNameAr: tenant.nameAr,
            horizonStart: todayKey,
            horizonEnd,
            last7dWasteSar: wasteTotal.toFixed(2),
            topRecommendations,
            totalForecastedItems: byItem.size,
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
          throw new Error(lastError ?? "Failed to send weekly summary emails");
        }
      }

      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "CRON_WEEKLY_TENANT_COMPLETED",
          entity: "CronJob",
          entityId: periodEntityId,
          metadata: {
            evaluatedAt: now.toISOString(),
            weekKey,
            horizonStart: todayKey,
            horizonEnd,
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
      logger.error("cron.weekly.tenant_failed", {
        tenantId: tenant.id,
        tenantCode: tenant.code,
        error: errorMsg,
      });
      await recordPeriodicTenantFailure(tenant.id, "weekly", now, errorMsg);
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

  return finalizePeriodicCronSummary("weekly", now, loopResult.outcomes, {
    skippedTenantIds: loopResult.skippedTenantIds,
    stoppedEarlyByBudget: loopResult.stoppedEarlyByBudget,
    budgetMs: loopResult.budgetMs,
    recordSummaryAudit: deps?.recordSummaryAudit,
  });
}
