import {
  type AlertSeverity,
  type AlertStatus,
  Prisma,
  type Shift,
  type Unit,
  type WasteReason,
} from "@prisma/client";
import { toTimeZoneDateKey } from "@/features/insights";
import { enumerateDateKeys, toDecimal } from "@/features/insights/math";
import { generateSuggestedActions } from "./action-rules";
import {
  calculateMonthlySavings,
  computeRecommendationAdherence,
} from "./savings";
import type {
  BaselineWindow,
  DailyReportCsvRow,
  MonthlyReportData,
  PeriodRawMetrics,
  ReportAlertRow,
  ReportReasonRow,
  ReportTopItemRow,
} from "./types";
import type { MonthWindow } from "./validation";

export interface AssembleMonthlyReportInput {
  restaurant: MonthlyReportData["restaurant"];
  yearMonth: string;
  now: Date;
  window: MonthWindow;
  baselineWindow: BaselineWindow;
  baselineMetrics: PeriodRawMetrics;
  currWaste: { wasteSar: string; entryCount: number };
  currSales: { unitsSold: string; salesCount: number };
  monthItemRows: Array<{
    menuItemId: string;
    code: string | null;
    name: string;
    nameAr: string;
    unit: string;
    wasteQty: string;
    wasteSar: string;
    entryCount: number;
  }>;
  baseItemRows: Array<{ menuItemId: string; wasteSar: string }>;
  itemWeekdayRows: Array<{
    menuItemId: string;
    weekday: number;
    totalQty: string;
    totalSar: string;
    dayCount: number;
  }>;
  reasonRows: Array<{ reason: string; wasteSar: string; entryCount: number }>;
  hotspotRows: Array<{
    weekday: number;
    shift: string;
    wasteSar: string;
    entryCount: number;
  }>;
  dailyWasteRows: Array<{
    dateKey: string;
    wasteSar: string;
    wasteQtySum: string;
    entryCount: number;
  }>;
  dailySpRows: Array<{
    dateKey: string;
    unitsSold: string;
    purchaseSar: string;
  }>;
  rawAlerts: Array<{
    id: string;
    severity: AlertSeverity;
    status: AlertStatus;
    messageKey: string;
    messageParams: Prisma.JsonValue;
    createdAt: Date;
  }>;
  monthForecasts: Array<{
    menuItemId: string;
    forDate: Date;
    recommendedQty: Prisma.Decimal;
  }>;
  monthPurchases: Array<{
    menuItemId: string;
    date: Date;
    quantity: Prisma.Decimal;
  }>;
}

/** Purely assembles a `MonthlyReportData` view model from pre-fetched SQL/Prisma rows. */
export function assembleMonthlyReport(
  input: AssembleMonthlyReportInput,
): MonthlyReportData {
  const { window: win, baselineWindow, restaurant } = input;
  const tz = restaurant.timezone;

  const savings = calculateMonthlySavings({
    baselineWindow,
    baselineMetrics: input.baselineMetrics,
    currentMetrics: {
      startDate: win.monthStartDate,
      endDate: win.periodEndDate,
      days: win.days,
      wasteSar: input.currWaste.wasteSar,
      entryCount: input.currWaste.entryCount,
      unitsSold: input.currSales.unitsSold,
      salesCount: input.currSales.salesCount,
    },
  });

  const totalMonthWaste = toDecimal(input.currWaste.wasteSar);
  const topItems: ReportTopItemRow[] = input.monthItemRows
    .filter((i) => toDecimal(i.wasteSar).gt(0))
    .slice(0, 5)
    .map((i) => {
      const sar = toDecimal(i.wasteSar);
      const sharePct = totalMonthWaste.gt(0)
        ? sar.div(totalMonthWaste).mul(100).toDecimalPlaces(1).toString()
        : "0";
      return {
        menuItemId: i.menuItemId,
        code: i.code,
        name: i.name,
        nameAr: i.nameAr,
        unit: i.unit as Unit,
        wasteQty: toDecimal(i.wasteQty).toDecimalPlaces(2).toString(),
        wasteSar: sar.toFixed(2),
        sharePct,
        entryCount: i.entryCount,
      };
    });

  const topReasons: ReportReasonRow[] = input.reasonRows.map((r) => {
    const sar = toDecimal(r.wasteSar);
    return {
      reason: r.reason as WasteReason,
      sarCost: sar.toFixed(2),
      sharePct: totalMonthWaste.gt(0)
        ? sar.div(totalMonthWaste).mul(100).toDecimalPlaces(1).toString()
        : "0",
      entryCount: r.entryCount,
    };
  });

  const alerts: ReportAlertRow[] = input.rawAlerts
    .filter((a) => {
      const dk = toTimeZoneDateKey(a.createdAt, tz);
      return dk >= win.monthStartDate && dk <= win.periodEndDate;
    })
    .map((a) => ({
      id: a.id,
      severity: a.severity,
      status: a.status,
      messageKey: a.messageKey,
      messageParams:
        a.messageParams && typeof a.messageParams === "object"
          ? (a.messageParams as Record<string, unknown>)
          : {},
      createdAtIso: a.createdAt.toISOString(),
    }));

  const adherence = computeRecommendationAdherence({
    forecasts: input.monthForecasts.map((f) => ({
      menuItemId: f.menuItemId,
      dateKey: f.forDate.toISOString().slice(0, 10),
      recommendedQty: f.recommendedQty,
    })),
    purchases: input.monthPurchases.map((p) => ({
      menuItemId: p.menuItemId,
      dateKey: p.date.toISOString().slice(0, 10),
      quantity: p.quantity,
    })),
  });

  const wasteByDayMap = new Map(input.dailyWasteRows.map((d) => [d.dateKey, d]));
  const spByDayMap = new Map(input.dailySpRows.map((d) => [d.dateKey, d]));
  let missingLoggingDaysCount = 0;

  const dailyRows: DailyReportCsvRow[] = enumerateDateKeys(
    win.monthStartDate,
    win.periodEndDate,
  ).map((dateKey) => {
    const dw = wasteByDayMap.get(dateKey);
    const sp = spByDayMap.get(dateKey);
    const wasteSarDec = toDecimal(dw?.wasteSar ?? "0");
    const unitsSoldDec = toDecimal(sp?.unitsSold ?? "0");
    if (unitsSoldDec.gt(0) && (dw?.entryCount ?? 0) === 0) {
      missingLoggingDaysCount += 1;
    }
    return {
      dateKey,
      wasteEntryCount: dw?.entryCount ?? 0,
      wasteQtySum: toDecimal(dw?.wasteQtySum ?? "0")
        .toDecimalPlaces(2)
        .toString(),
      wasteSar: wasteSarDec.toFixed(2),
      unitsSold: unitsSoldDec.toDecimalPlaces(2).toString(),
      wasteSarPerUnit: unitsSoldDec.gt(0)
        ? wasteSarDec.div(unitsSoldDec).toDecimalPlaces(4).toFixed(4)
        : "0.0000",
      purchaseSar: toDecimal(sp?.purchaseSar ?? "0").toFixed(2),
    };
  });

  const baseWeeks = new Prisma.Decimal(baselineWindow.days).div(7);
  const baseItemWeeklyMap = new Map(
    input.baseItemRows.map((b) => [
      b.menuItemId,
      toDecimal(b.wasteSar).div(baseWeeks),
    ]),
  );

  const peakWeekdayMap = new Map<
    string,
    { weekday: number; totalSar: Prisma.Decimal; avgQty: Prisma.Decimal }
  >();
  for (const row of input.itemWeekdayRows) {
    const totalSar = toDecimal(row.totalSar);
    const avgQty =
      row.dayCount > 0
        ? toDecimal(row.totalQty).div(row.dayCount)
        : new Prisma.Decimal(0);
    const existing = peakWeekdayMap.get(row.menuItemId);
    if (!existing || totalSar.gt(existing.totalSar)) {
      peakWeekdayMap.set(row.menuItemId, {
        weekday: row.weekday,
        totalSar,
        avgQty,
      });
    }
  }

  const hotspot = input.hotspotRows[0]
    ? {
        weekday: input.hotspotRows[0].weekday,
        shift: input.hotspotRows[0].shift as Shift,
        sarCost: toDecimal(input.hotspotRows[0].wasteSar).toFixed(2),
        entryCount: input.hotspotRows[0].entryCount,
      }
    : null;

  const suggestedActions = generateSuggestedActions({
    items: input.monthItemRows.map((m) => {
      const peak = peakWeekdayMap.get(m.menuItemId);
      return {
        menuItemId: m.menuItemId,
        name: m.name,
        nameAr: m.nameAr,
        unit: m.unit as Unit,
        monthWasteSar: m.wasteSar,
        monthWasteQty: m.wasteQty,
        baselineWeeklyWasteSar: baseItemWeeklyMap.get(m.menuItemId) ?? "0",
        monthWeeks: new Prisma.Decimal(win.days).div(7),
        peakWeekday: peak?.weekday ?? null,
        peakWeekdayAvgQty: peak?.avgQty ?? "0",
      };
    }),
    reasons: topReasons,
    hotspotPeak: hotspot,
    missingLoggingDaysCount,
    savings,
  });

  return {
    restaurant,
    yearMonth: input.yearMonth,
    periodStartDate: win.monthStartDate,
    periodEndDate: win.periodEndDate,
    generatedAtIso: input.now.toISOString(),
    baselineWindow,
    savings,
    topItems,
    topReasons,
    alerts,
    adherence,
    suggestedActions,
    dailyRows,
    hotspotPeak: hotspot,
  };
}
