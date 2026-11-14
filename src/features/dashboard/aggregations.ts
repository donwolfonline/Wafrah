import { Prisma } from "@prisma/client";
import {
  classifyItems,
  type DecimalInput,
  shiftDateKey,
} from "@/features/insights";
import { enumerateDateKeys, toDecimal } from "@/features/insights/math";
import {
  buildHeatmapMatrix,
  buildRankedReasons,
} from "./breakdown-aggregations";
import type {
  ChangeDirection,
  DailyWasteTrendPoint,
  DashboardKpiSummary,
  DashboardRangeDays,
  DashboardReasonRow,
  ItemWasteBarDatum,
  RawDailyWasteRow,
  RawItemWasteRow,
  RawPurchaseSummaryRow,
} from "./types";

export { buildHeatmapMatrix, buildRankedReasons };

export function parseDashboardRange(
  raw?: string | number | null,
): DashboardRangeDays {
  if (raw === 7 || raw === "7") return 7;
  if (raw === 90 || raw === "90") return 90;
  return 30;
}

export function computePeriodChange(
  currentInput: DecimalInput,
  previousInput: DecimalInput,
): {
  pctChange: string | null;
  direction: ChangeDirection;
} {
  const current = toDecimal(currentInput);
  const previous = toDecimal(previousInput);
  const diff = current.sub(previous);

  const direction: ChangeDirection = diff.gt(0)
    ? "up"
    : diff.lt(0)
      ? "down"
      : "flat";

  if (previous.lte(0)) {
    return {
      pctChange: current.eq(0) ? "0" : null,
      direction,
    };
  }

  const pct = diff.div(previous).mul(100).toDecimalPlaces(1);
  return {
    pctChange: pct.toString(),
    direction: pct.gt(0) ? "up" : pct.lt(0) ? "down" : "flat",
  };
}

export function buildDailyTrendSeries(
  rows: RawDailyWasteRow[],
  periodStartKey: string,
  periodEndKey: string,
  maWindowDays = 7,
): DailyWasteTrendPoint[] {
  const byDate = new Map<
    string,
    { wasteSar: Prisma.Decimal; entryCount: number }
  >();
  for (const row of rows) {
    const prev = byDate.get(row.dateKey);
    const addSar = toDecimal(row.wasteSar);
    if (prev) {
      prev.wasteSar = prev.wasteSar.add(addSar);
      prev.entryCount += Number(row.entryCount);
    } else {
      byDate.set(row.dateKey, {
        wasteSar: addSar,
        entryCount: Number(row.entryCount),
      });
    }
  }

  const plottedDates = enumerateDateKeys(periodStartKey, periodEndKey);
  return plottedDates.map((dateKey) => {
    const dayEntry = byDate.get(dateKey);
    const wasteSar = (dayEntry?.wasteSar ?? new Prisma.Decimal(0))
      .toDecimalPlaces(2)
      .toString();

    let maSum = new Prisma.Decimal(0);
    for (let offset = -(maWindowDays - 1); offset <= 0; offset += 1) {
      const val = byDate.get(shiftDateKey(dateKey, offset))?.wasteSar;
      if (val) {
        maSum = maSum.add(val);
      }
    }

    const movingAvg7dSar = maSum
      .div(maWindowDays)
      .toDecimalPlaces(2)
      .toString();

    return {
      dateKey,
      wasteSar,
      movingAvg7dSar,
      entryCount: dayEntry?.entryCount ?? 0,
    };
  });
}

export function buildTopItemBars(
  rows: RawItemWasteRow[],
  maxBars = 8,
): ItemWasteBarDatum[] {
  const nonZeroRows = rows.filter((r) => toDecimal(r.wasteSar).gt(0));
  if (nonZeroRows.length === 0) return [];

  const classified = classifyItems(
    nonZeroRows.map((r) => ({
      menuItemId: r.menuItemId,
      sarCost: toDecimal(r.wasteSar),
    })),
  );

  const rowMap = new Map(nonZeroRows.map((r) => [r.menuItemId, r]));
  return classified.slice(0, maxBars).map((cls) => {
    const meta = rowMap.get(cls.menuItemId)!;
    return {
      menuItemId: meta.menuItemId,
      code: meta.code,
      name: meta.name,
      nameAr: meta.nameAr,
      unit: meta.unit,
      wasteQty: toDecimal(meta.wasteQty).toDecimalPlaces(2).toString(),
      wasteSar: cls.sarCost,
      sharePct: cls.sharePct,
      tier: cls.tier,
    };
  });
}

export function buildDashboardKpis(params: {
  rangeDays: DashboardRangeDays;
  periodStartDate: string;
  periodEndDate: string;
  prevStartDate: string;
  prevEndDate: string;
  currentWasteSar: DecimalInput;
  prevWasteSar: DecimalInput;
  currentEntryCount: number;
  prevEntryCount: number;
  currentPurchases: RawPurchaseSummaryRow;
  prevPurchases: RawPurchaseSummaryRow;
  rankedReasons: DashboardReasonRow[];
}): DashboardKpiSummary {
  const currentWaste = toDecimal(params.currentWasteSar);
  const prevWaste = toDecimal(params.prevWasteSar);
  const wasteDelta = computePeriodChange(currentWaste, prevWaste);
  const entryDelta = computePeriodChange(
    params.currentEntryCount,
    params.prevEntryCount,
  );

  const currPurchSar = toDecimal(params.currentPurchases.totalCostSar);
  const prevPurchSar = toDecimal(params.prevPurchases.totalCostSar);
  const hasPurchaseData =
    Number(params.currentPurchases.recordCount) > 0 && currPurchSar.gt(0);
  const hasPrevPurchases =
    Number(params.prevPurchases.recordCount) > 0 && prevPurchSar.gt(0);

  let wasteAsPctOfPurchases: string | null = null;
  let prevWasteAsPctOfPurchases: string | null = null;
  let purchasePctChangePts: string | null = null;
  let purchasePctDirection: ChangeDirection = "flat";

  if (hasPurchaseData) {
    const currPct = currentWaste.div(currPurchSar).mul(100);
    wasteAsPctOfPurchases = currPct.toDecimalPlaces(1).toString();

    if (hasPrevPurchases) {
      const prevPct = prevWaste.div(prevPurchSar).mul(100);
      prevWasteAsPctOfPurchases = prevPct.toDecimalPlaces(1).toString();
      const diffPts = currPct.sub(prevPct).toDecimalPlaces(1);
      purchasePctChangePts = diffPts.toString();
      purchasePctDirection = diffPts.gt(0)
        ? "up"
        : diffPts.lt(0)
          ? "down"
          : "flat";
    }
  }

  return {
    rangeDays: params.rangeDays,
    periodStartDate: params.periodStartDate,
    periodEndDate: params.periodEndDate,
    prevStartDate: params.prevStartDate,
    prevEndDate: params.prevEndDate,
    totalWasteSar: currentWaste.toDecimalPlaces(2).toString(),
    prevWasteSar: prevWaste.toDecimalPlaces(2).toString(),
    wasteCostChangePct: wasteDelta.pctChange,
    wasteCostDirection: wasteDelta.direction,
    wasteEntryCount: params.currentEntryCount,
    prevWasteEntryCount: params.prevEntryCount,
    entryCountChangePct: entryDelta.pctChange,
    entryCountDirection: entryDelta.direction,
    hasPurchaseData,
    totalPurchaseSar: currPurchSar.toDecimalPlaces(2).toString(),
    wasteAsPctOfPurchases,
    prevWasteAsPctOfPurchases,
    purchasePctChangePts,
    purchasePctDirection,
    topReason: params.rankedReasons[0] ?? null,
  };
}
