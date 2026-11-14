import type { Prisma } from "@prisma/client";
import { shiftDateKey, toTimeZoneDateKey } from "@/features/insights";
import { toDecimal } from "@/features/insights/math";
import { sendEmail } from "@/lib/email";
import { RIYADH_TIME_ZONE } from "@/lib/format";
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
  TenantCronOutcome,
  WeeklyRecommendationRow,
} from "./types";

export async function runWeeklyCronJob(
  now: Date = new Date(),
  deps?: PeriodicCronDependencies,
): Promise<ScheduledCronSummary> {
  const listRestaurants = deps?.listRestaurants ?? listDefaultRestaurants;
  const sendEmailFn = deps?.sendEmailFn ?? sendEmail;
  const resolvedAppUrl =
    deps?.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";

  const restaurants = await listRestaurants();
  const tenants: TenantCronOutcome[] = [];

  for (const tenant of restaurants) {
    try {
      const recipients = await loadTenantManagerRecipients(
        tenant.id,
        "weeklySummary",
      );
      let emailsSent = 0;

      if (recipients.length > 0) {
        const db = createTenantDb(tenant.id);
        const tz = tenant.timezone || RIYADH_TIME_ZONE;
        const todayKey = toTimeZoneDateKey(now, tz);
        const horizonEnd = shiftDateKey(todayKey, 6);
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
          if (res.ok) emailsSent += 1;
        }
      }

      const db = createTenantDb(tenant.id);
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "CRON_WEEKLY_TENANT_COMPLETED",
          entity: "CronJob",
          entityId: "weekly",
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
      console.error(`[cron:weekly] Tenant ${tenant.code} failed: ${errorMsg}`);
      await recordPeriodicTenantFailure(tenant.id, "weekly", now, errorMsg);
      tenants.push({
        tenantId: tenant.id,
        tenantCode: tenant.code,
        status: "FAILED",
        emailsSent: 0,
        error: errorMsg,
      });
    }
  }

  return finalizePeriodicCronSummary("weekly", now, tenants);
}
