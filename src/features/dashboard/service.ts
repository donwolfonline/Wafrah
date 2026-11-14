import type { Shift, Unit, WasteReason } from "@prisma/client";
import { shiftDateKey, toTimeZoneDateKey } from "@/features/insights";
import { enumerateDateKeys } from "@/features/insights/math";
import { requireRole, type SessionUser } from "@/lib/authz";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { getTenantDb } from "@/lib/tenant";
import {
  buildDailyTrendSeries,
  buildDashboardKpis,
  buildHeatmapMatrix,
  buildRankedReasons,
  buildTopItemBars,
  parseDashboardRange,
} from "./aggregations";
import {
  buildRecommendationsRows,
  sortAlertsForDashboard,
} from "./alerts-recommendations";
import { computeOnboardingChecklist } from "./onboarding";
import {
  type DashboardSqlParams,
  fetchDailyWasteSql,
  fetchHeatmapSql,
  fetchItemWasteSql,
  fetchPeriodSummarySql,
  fetchPurchaseSummarySql,
  fetchReasonWasteSql,
  fetchSalesDaysPerItemSql,
} from "./queries";
import type {
  DashboardAlertRow,
  DashboardData,
  DashboardRangeDays,
  RawHeatmapRow,
} from "./types";

export class DashboardNotFoundError extends Error {
  public readonly statusCode = 404;

  constructor(message = "Resource not found") {
    super(message);
    this.name = "DashboardNotFoundError";
  }
}

export async function getDashboardDataForTenant(
  sessionUser: SessionUser,
  options?: { rangeDays?: DashboardRangeDays | string | number; now?: Date },
): Promise<DashboardData> {
  const startedAt = performance.now();
  const user = await requireRole("insights.read", sessionUser);
  const db = await getTenantDb(user);
  const rangeDays = parseDashboardRange(options?.rangeDays);
  const now = options?.now ?? new Date();

  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: user.tenantId! },
    select: { id: true, timezone: true },
  });
  const timeZone = restaurant.timezone || RIYADH_TIME_ZONE;

  const todayKey = toTimeZoneDateKey(now, timeZone);
  const periodEndKey = todayKey;
  const periodStartKey = shiftDateKey(todayKey, -(rangeDays - 1));
  const prevEndKey = shiftDateKey(periodStartKey, -1);
  const prevStartKey = shiftDateKey(prevEndKey, -(rangeDays - 1));
  const maStartKey = shiftDateKey(periodStartKey, -6);

  const sqlParams: DashboardSqlParams = {
    timeZone,
    periodStartKey,
    periodEndKey,
    prevStartKey,
    prevEndKey,
    maStartKey,
    prevIndexStartUtc: new Date(`${shiftDateKey(prevStartKey, -1)}T00:00:00.000Z`),
    maIndexStartUtc: new Date(`${shiftDateKey(maStartKey, -1)}T00:00:00.000Z`),
    currIndexStartUtc: new Date(`${shiftDateKey(periodStartKey, -1)}T00:00:00.000Z`),
    indexEndUtc: new Date(`${shiftDateKey(periodEndKey, 2)}T00:00:00.000Z`),
  };

  const todayUtc = new Date(`${todayKey}T00:00:00.000Z`);
  const horizonUpperUtc = new Date(`${shiftDateKey(todayKey, 8)}T00:00:00.000Z`);

  const [
    periodSummaryRows,
    dailyRows,
    itemRows,
    heatmapRows,
    reasonRows,
    purchaseRows,
    salesDaysRows,
    activeMenuItems,
    rawAlerts,
    futureForecasts,
    totalWasteCount,
    totalSalesCount,
    activeStaffCount,
    totalAlertCount,
    totalForecastCount,
  ] = await Promise.all([
    fetchPeriodSummarySql(db, sqlParams),
    fetchDailyWasteSql(db, sqlParams),
    fetchItemWasteSql(db, sqlParams),
    fetchHeatmapSql(db, sqlParams),
    fetchReasonWasteSql(db, sqlParams),
    fetchPurchaseSummarySql(db, sqlParams),
    fetchSalesDaysPerItemSql(db),
    db.menuItem.findMany({
      where: { active: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, code: true, name: true, nameAr: true, unit: true },
    }),
    db.alert.findMany({
      where: { status: { not: "DISMISSED" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        menuItemId: true,
        type: true,
        severity: true,
        messageKey: true,
        messageParams: true,
        status: true,
        createdAt: true,
      },
    }),
    db.forecastResult.findMany({
      where: { forDate: { gte: todayUtc, lte: horizonUpperUtc } },
      orderBy: [{ forDate: "asc" }],
      select: {
        menuItemId: true,
        forDate: true,
        meanQty: true,
        lowQty: true,
        highQty: true,
        recommendedQty: true,
        inputsSnapshot: true,
      },
    }),
    db.wasteEntry.count({ where: { deletedAt: null } }),
    db.salesRecord.count(),
    db.user.count({ where: { role: "STAFF", active: true } }),
    db.alert.count(),
    db.forecastResult.count(),
  ]);

  const summary = periodSummaryRows[0] ?? {
    currentWasteSar: "0",
    currentEntryCount: 0,
    prevWasteSar: "0",
    prevEntryCount: 0,
  };
  const purch = purchaseRows[0] ?? {
    currentPurchaseSar: "0",
    currentPurchaseCount: 0,
    prevPurchaseSar: "0",
    prevPurchaseCount: 0,
  };

  const rankedReasons = buildRankedReasons(
    reasonRows.map((r) => ({ ...r, reason: r.reason as WasteReason })),
  );
  const kpis = buildDashboardKpis({
    rangeDays,
    periodStartDate: periodStartKey,
    periodEndDate: periodEndKey,
    prevStartDate: prevStartKey,
    prevEndDate: prevEndKey,
    currentWasteSar: summary.currentWasteSar,
    prevWasteSar: summary.prevWasteSar,
    currentEntryCount: summary.currentEntryCount,
    prevEntryCount: summary.prevEntryCount,
    currentPurchases: {
      totalCostSar: purch.currentPurchaseSar,
      recordCount: purch.currentPurchaseCount,
    },
    prevPurchases: {
      totalCostSar: purch.prevPurchaseSar,
      recordCount: purch.prevPurchaseCount,
    },
    rankedReasons,
  });

  const dailyTrend = buildDailyTrendSeries(
    dailyRows,
    periodStartKey,
    periodEndKey,
  );
  const itemBars = buildTopItemBars(
    itemRows.map((r) => ({ ...r, unit: r.unit as Unit })),
  );
  const heatmap = buildHeatmapMatrix(
    heatmapRows.map((h) => ({ ...h, shift: h.shift as Shift }) satisfies RawHeatmapRow),
  );

  const mappedAlerts: DashboardAlertRow[] = rawAlerts.map((a) => ({
    id: a.id,
    menuItemId: a.menuItemId,
    type: a.type,
    severity: a.severity,
    messageKey: a.messageKey,
    messageParams:
      a.messageParams && typeof a.messageParams === "object"
        ? (a.messageParams as Record<string, unknown>)
        : {},
    status: a.status,
    createdAtIso: a.createdAt.toISOString(),
  }));

  const earliestForecastKey =
    futureForecasts.length > 0
      ? futureForecasts[0]!.forDate.toISOString().slice(0, 10)
      : todayKey;
  const horizonStartKey = earliestForecastKey > todayKey ? earliestForecastKey : todayKey;
  const horizonDates = enumerateDateKeys(horizonStartKey, shiftDateKey(horizonStartKey, 6));

  const salesDaysByItem = Object.fromEntries(
    salesDaysRows.map((row) => [row.menuItemId, Number(row.daysCount)]),
  );

  const recommendationsItems = buildRecommendationsRows({
    menuItems: activeMenuItems,
    horizonDates,
    forecasts: futureForecasts,
    salesDaysByItem,
  });

  const checklist = computeOnboardingChecklist({
    activeMenuItemsCount: activeMenuItems.length,
    activeStaffCount,
    salesRecordsCount: totalSalesCount,
    wasteEntriesCount: totalWasteCount,
    insightsAlertsCount: totalAlertCount,
    forecastsCount: totalForecastCount,
  });

  return {
    rangeDays,
    kpis,
    dailyTrend,
    itemBars,
    heatmap,
    reasons: rankedReasons,
    alerts: sortAlertsForDashboard(mappedAlerts),
    recommendations: { horizonDates, items: recommendationsItems },
    checklist,
    serverLoadMs: Math.round(performance.now() - startedAt),
  };
}

export async function updateDashboardAlertStatus(
  sessionUser: SessionUser,
  alertId: string,
  status: "READ" | "DISMISSED",
) {
  const user = await requireRole(["MANAGER", "OWNER"], sessionUser);
  const db = await getTenantDb(user);

  const existing = await db.alert.findFirst({
    where: { id: alertId },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw new DashboardNotFoundError("Alert not found");
  }

  const updated = await db.alert.update({
    where: { id: alertId },
    data: { status },
    select: { id: true, status: true },
  });

  await db.auditLog.create({
    data: {
      tenantId: user.tenantId!,
      userId: user.userId,
      action: status === "DISMISSED" ? "ALERT_DISMISSED" : "ALERT_READ",
      entity: "Alert",
      entityId: alertId,
      metadata: {
        previousStatus: existing.status,
        nextStatus: status,
      },
    },
  });

  return updated;
}
