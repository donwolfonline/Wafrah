import { toDecimal } from "@/features/insights/math";
import { requireRole, type SessionUser } from "@/lib/authz";
import { getTenantDb } from "@/lib/tenant";
import { loadTenantBaselineContext } from "./baseline-context";
import {
  fetchDailySalesAndPurchasesSql,
  fetchDailyWasteBreakdownSql,
} from "./daily-queries";
import {
  fetchDistinctReportMonthsSql,
  fetchItemWasteTotalsSql,
  fetchItemWeekdayBreakdownSql,
  fetchPeriodSalesTotalSql,
  fetchPeriodWasteTotalSql,
  fetchReasonTotalsSql,
  fetchTopHotspotSql,
  makeWasteSqlRange,
} from "./queries";
import { assembleMonthlyReport } from "./report-builder";
import { calculateMonthlySavings } from "./savings";
import type { MonthlyReportData, ReportMonthSummary } from "./types";
import {
  BaselineUpdateSchema,
  parseMonthWindow,
  ReportsValidationError,
} from "./validation";

/** Lists all months with waste or sales history for the manager's restaurant, newest first. */
export async function listReportMonthsForTenant(
  sessionUser: SessionUser,
  options?: { now?: Date },
) {
  const user = await requireRole(["MANAGER", "OWNER"], sessionUser);
  const db = await getTenantDb(user);
  const now = options?.now ?? new Date();
  const ctx = await loadTenantBaselineContext(db, user.tenantId!, now);
  const monthRows = await fetchDistinctReportMonthsSql(db, ctx.restaurant.timezone);

  const months: ReportMonthSummary[] = await Promise.all(
    monthRows.map(async ({ yearMonth }) => {
      const win = parseMonthWindow(yearMonth, ctx.asOfDateKey);
      const wasteRange = makeWasteSqlRange(
        ctx.restaurant.timezone,
        win.monthStartDate,
        win.periodEndDate,
      );
      const [wasteRows, salesRows] = await Promise.all([
        fetchPeriodWasteTotalSql(db, wasteRange),
        fetchPeriodSalesTotalSql(db, win.monthStartDate, win.periodEndDate),
      ]);
      const w = wasteRows[0] ?? { wasteSar: "0", entryCount: 0 };
      const s = salesRows[0] ?? { unitsSold: "0", salesCount: 0 };

      const savings = calculateMonthlySavings({
        baselineWindow: ctx.baselineWindow,
        baselineMetrics: ctx.baselineMetrics,
        currentMetrics: {
          startDate: win.monthStartDate,
          endDate: win.periodEndDate,
          days: win.days,
          wasteSar: w.wasteSar,
          entryCount: w.entryCount,
          unitsSold: s.unitsSold,
          salesCount: s.salesCount,
        },
      });

      return {
        yearMonth,
        monthStartDate: win.monthStartDate,
        monthEndDate: win.periodEndDate,
        wasteSar: toDecimal(w.wasteSar).toFixed(2),
        wasteEntryCount: w.entryCount,
        unitsSold: toDecimal(s.unitsSold).toDecimalPlaces(1).toString(),
        hasSalesData: s.salesCount > 0 && toDecimal(s.unitsSold).gt(0),
        savings,
      };
    }),
  );

  return {
    restaurant: ctx.restaurant,
    baselineWindow: ctx.baselineWindow,
    months,
  };
}

/** Loads and builds the full monthly savings and operations report for `YYYY-MM`. */
export async function getMonthlyReportForTenant(
  sessionUser: SessionUser,
  yearMonth: string,
  options?: { now?: Date },
): Promise<MonthlyReportData> {
  const user = await requireRole(["MANAGER", "OWNER"], sessionUser);
  const db = await getTenantDb(user);
  const now = options?.now ?? new Date();
  const ctx = await loadTenantBaselineContext(db, user.tenantId!, now);
  const tz = ctx.restaurant.timezone;
  const win = parseMonthWindow(yearMonth, ctx.asOfDateKey);

  const monthRange = makeWasteSqlRange(tz, win.monthStartDate, win.periodEndDate);
  const baseRange = makeWasteSqlRange(
    tz,
    ctx.baselineWindow.startDate,
    ctx.baselineWindow.endDate,
  );

  const [
    currWasteRows,
    currSalesRows,
    monthItemRows,
    baseItemRows,
    itemWeekdayRows,
    reasonRows,
    hotspotRows,
    dailyWasteRows,
    dailySpRows,
    rawAlerts,
    monthForecasts,
    monthPurchases,
  ] = await Promise.all([
    fetchPeriodWasteTotalSql(db, monthRange),
    fetchPeriodSalesTotalSql(db, win.monthStartDate, win.periodEndDate),
    fetchItemWasteTotalsSql(db, monthRange),
    fetchItemWasteTotalsSql(db, baseRange),
    fetchItemWeekdayBreakdownSql(db, monthRange),
    fetchReasonTotalsSql(db, monthRange),
    fetchTopHotspotSql(db, monthRange),
    fetchDailyWasteBreakdownSql(db, monthRange),
    fetchDailySalesAndPurchasesSql(db, win.monthStartDate, win.periodEndDate),
    db.alert.findMany({
      where: {
        createdAt: {
          gte: monthRange.indexStartUtc,
          lt: monthRange.indexEndUtc,
        },
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 30,
      select: {
        id: true,
        severity: true,
        status: true,
        messageKey: true,
        messageParams: true,
        createdAt: true,
      },
    }),
    db.forecastResult.findMany({
      where: {
        forDate: {
          gte: new Date(`${win.monthStartDate}T00:00:00.000Z`),
          lte: new Date(`${win.periodEndDate}T00:00:00.000Z`),
        },
      },
      select: { menuItemId: true, forDate: true, recommendedQty: true },
    }),
    db.purchaseRecord.findMany({
      where: {
        date: {
          gte: new Date(`${win.monthStartDate}T00:00:00.000Z`),
          lte: new Date(`${win.periodEndDate}T00:00:00.000Z`),
        },
      },
      select: { menuItemId: true, date: true, quantity: true },
    }),
  ]);

  return assembleMonthlyReport({
    restaurant: ctx.restaurant,
    yearMonth,
    now,
    window: win,
    baselineWindow: ctx.baselineWindow,
    baselineMetrics: ctx.baselineMetrics,
    currWaste: currWasteRows[0] ?? { wasteSar: "0", entryCount: 0 },
    currSales: currSalesRows[0] ?? { unitsSold: "0", salesCount: 0 },
    monthItemRows,
    baseItemRows,
    itemWeekdayRows,
    reasonRows,
    hotspotRows,
    dailyWasteRows,
    dailySpRows,
    rawAlerts,
    monthForecasts,
    monthPurchases,
  });
}

/** Updates (or resets when null) the restaurant's savings baseline window with audit logging. */
export async function updateRestaurantBaselineForTenant(
  sessionUser: SessionUser,
  rawInput: unknown,
) {
  const user = await requireRole(["MANAGER", "OWNER"], sessionUser);
  const parsed = BaselineUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ReportsValidationError(
      parsed.error.issues[0]?.message ?? "Invalid baseline range",
    );
  }

  const db = await getTenantDb(user);
  const startUtc = parsed.data.baselineStart
    ? new Date(`${parsed.data.baselineStart}T00:00:00.000Z`)
    : null;
  const endUtc = parsed.data.baselineEnd
    ? new Date(`${parsed.data.baselineEnd}T00:00:00.000Z`)
    : null;

  const updated = await db.restaurant.update({
    where: { id: user.tenantId! },
    data: { baselineStart: startUtc, baselineEnd: endUtc },
    select: { id: true, baselineStart: true, baselineEnd: true },
  });

  await db.auditLog.create({
    data: {
      tenantId: user.tenantId!,
      userId: user.userId,
      action: "BASELINE_UPDATED",
      entity: "Restaurant",
      entityId: user.tenantId!,
      metadata: {
        baselineStart: parsed.data.baselineStart,
        baselineEnd: parsed.data.baselineEnd,
      },
    },
  });

  return {
    baselineStart: updated.baselineStart
      ? updated.baselineStart.toISOString().slice(0, 10)
      : null,
    baselineEnd: updated.baselineEnd
      ? updated.baselineEnd.toISOString().slice(0, 10)
      : null,
  };
}
