import { Prisma } from "@prisma/client";
import {
  decimalMad,
  decimalMax,
  decimalMedian,
  diffDateKeys,
  enumerateDateKeys,
  getDateKeyWeekday,
  getUnitFloorQty,
  shiftDateKey,
  toDecimal,
} from "./math";
import type {
  ComparisonMode,
  DetectedSpike,
  DetectSpikesOptions,
  DetectSpikesResult,
  SpikeSeriesItemMeta,
  SpikeSeriesPoint,
} from "./types";

const MAD_CONSISTENCY_CONSTANT = new Prisma.Decimal("1.4826");
const RELATIVE_MEDIAN_FLOOR = new Prisma.Decimal("0.15");

function resolveWindowEndDate(
  dailySeries: SpikeSeriesPoint[],
  explicitAsOf?: string,
): string | null {
  if (explicitAsOf) return explicitAsOf;
  if (dailySeries.length === 0) return null;
  let maxKey = dailySeries[0]!.dateKey;
  for (const point of dailySeries) {
    if (point.dateKey > maxKey) {
      maxKey = point.dateKey;
    }
  }
  return maxKey;
}

export function detectSpikes(
  series: {
    dailySeries: SpikeSeriesPoint[];
    items: SpikeSeriesItemMeta[];
  },
  options: DetectSpikesOptions = {},
): DetectSpikesResult {
  const { dailySeries, items } = series;
  const recentDays = options.recentDays ?? 3;
  const baselineDays = options.baselineDays ?? 28;
  const minHistoryDays = options.minHistoryDays ?? 14;
  const fullHistoryDays = options.fullHistoryDays ?? 28;
  const minWeekdaySamples = options.minWeekdaySamples ?? 4;
  const warningZ = toDecimal(options.warningZ ?? 2.5);
  const criticalZ = toDecimal(options.criticalZ ?? 3.5);
  const minAbsQtyChange = toDecimal(options.minAbsQtyChange ?? 1);
  const minAbsSarChange = toDecimal(options.minAbsSarChange ?? 15);
  const maxAlerts = options.maxAlerts ?? 5;

  const windowEnd = resolveWindowEndDate(dailySeries, options.asOfDate);
  if (!windowEnd || items.length === 0) {
    return { spikes: [], coldStartItemIds: [], evaluatedItemCount: 0 };
  }

  const recentStart = shiftDateKey(windowEnd, -(recentDays - 1));
  const baselineEnd = shiftDateKey(recentStart, -1);
  const baselineStart = shiftDateKey(baselineEnd, -(baselineDays - 1));

  const qtyByItemAndDate = new Map<string, Map<string, Prisma.Decimal>>();
  const firstDateByItem = new Map<string, string>();

  for (const point of dailySeries) {
    if (point.dateKey > windowEnd) continue;
    const qty = toDecimal(point.quantity);
    let itemMap = qtyByItemAndDate.get(point.menuItemId);
    if (!itemMap) {
      itemMap = new Map<string, Prisma.Decimal>();
      qtyByItemAndDate.set(point.menuItemId, itemMap);
    }
    const prev = itemMap.get(point.dateKey) ?? new Prisma.Decimal(0);
    itemMap.set(point.dateKey, prev.add(qty));

    const first = firstDateByItem.get(point.menuItemId);
    if (!first || point.dateKey < first) {
      firstDateByItem.set(point.menuItemId, point.dateKey);
    }
  }

  const spikes: DetectedSpike[] = [];
  const coldStartItemIds: string[] = [];
  let evaluatedItemCount = 0;

  const recentKeys = enumerateDateKeys(recentStart, windowEnd);

  for (const item of items) {
    const itemDates = qtyByItemAndDate.get(item.id);
    const firstDate = firstDateByItem.get(item.id);
    if (!itemDates || !firstDate) {
      coldStartItemIds.push(item.id);
      continue;
    }

    const historyDays = diffDateKeys(firstDate, windowEnd) + 1;
    if (historyDays < minHistoryDays) {
      coldStartItemIds.push(item.id);
      continue;
    }

    const effectiveBaselineStart =
      firstDate > baselineStart ? firstDate : baselineStart;
    const baselineKeys = enumerateDateKeys(effectiveBaselineStart, baselineEnd);
    if (baselineKeys.length === 0) {
      coldStartItemIds.push(item.id);
      continue;
    }

    evaluatedItemCount += 1;

    const baselinePoints = baselineKeys.map((dateKey) => ({
      dateKey,
      weekday: getDateKeyWeekday(dateKey),
      qty: itemDates.get(dateKey) ?? new Prisma.Decimal(0),
    }));
    const overallSampleValues = baselinePoints.map((p) => p.qty);
    const overallMedian = decimalMedian(overallSampleValues);
    const overallMad = decimalMad(overallSampleValues, overallMedian);
    const unitFloor = getUnitFloorQty(item.unit);
    const unitCost = toDecimal(item.unitCost);

    let bestCandidate: {
      dayKey: string;
      baseline: Prisma.Decimal;
      observed: Prisma.Decimal;
      zScore: Prisma.Decimal;
      absQtyChange: Prisma.Decimal;
      sarImpact: Prisma.Decimal;
      severity: DetectedSpike["severity"];
      comparisonMode: ComparisonMode;
    } | null = null;

    for (const dayKey of recentKeys) {
      const dayObserved = itemDates.get(dayKey) ?? new Prisma.Decimal(0);
      const weekday = getDateKeyWeekday(dayKey);
      const weekdaySamples = baselinePoints
        .filter((p) => p.weekday === weekday)
        .map((p) => p.qty);

      const useWeekday = weekdaySamples.length >= minWeekdaySamples;
      const med = useWeekday ? decimalMedian(weekdaySamples) : overallMedian;
      const mad = useWeekday ? decimalMad(weekdaySamples, med) : overallMad;

      const madScale = MAD_CONSISTENCY_CONSTANT.mul(mad);
      const relFloor = RELATIVE_MEDIAN_FLOOR.mul(med);
      const scale = decimalMax(madScale, decimalMax(relFloor, unitFloor));

      const absQtyChange = dayObserved.sub(med);
      if (absQtyChange.lte(0) || scale.lte(0)) continue;

      const sarImpact = absQtyChange.mul(unitCost);
      const zScore = absQtyChange.div(scale);

      if (
        absQtyChange.lt(minAbsQtyChange) ||
        sarImpact.lt(minAbsSarChange) ||
        zScore.lt(warningZ)
      ) {
        continue;
      }

      const severity: DetectedSpike["severity"] =
        historyDays >= fullHistoryDays && zScore.gte(criticalZ)
          ? "CRITICAL"
          : "WARNING";
      const comparisonMode: ComparisonMode = useWeekday ? "WEEKDAY" : "OVERALL";

      const isBetter =
        !bestCandidate ||
        (severity === "CRITICAL" && bestCandidate.severity !== "CRITICAL") ||
        (severity === bestCandidate.severity &&
          (sarImpact.gt(bestCandidate.sarImpact) ||
            (sarImpact.eq(bestCandidate.sarImpact) &&
              (zScore.gt(bestCandidate.zScore) ||
                (zScore.eq(bestCandidate.zScore) &&
                  dayKey > bestCandidate.dayKey)))));

      if (isBetter) {
        bestCandidate = {
          dayKey,
          baseline: med,
          observed: dayObserved,
          zScore,
          absQtyChange,
          sarImpact,
          severity,
          comparisonMode,
        };
      }
    }

    if (!bestCandidate) {
      continue;
    }

    const percentageChange = bestCandidate.baseline.gt(0)
      ? bestCandidate.absQtyChange
          .div(bestCandidate.baseline)
          .mul(100)
          .toDecimalPlaces(1)
          .toString()
      : null;

    spikes.push({
      menuItemId: item.id,
      itemCode: item.code ?? null,
      itemName: item.name,
      itemNameAr: item.nameAr,
      unit: item.unit,
      severity: bestCandidate.severity,
      windowEndDate: windowEnd,
      baseline: bestCandidate.baseline.toDecimalPlaces(3).toString(),
      observed: bestCandidate.observed.toDecimalPlaces(3).toString(),
      zScore: bestCandidate.zScore.toDecimalPlaces(2).toString(),
      percentageChange,
      absQtyChange: bestCandidate.absQtyChange.toDecimalPlaces(3).toString(),
      sarImpact: bestCandidate.sarImpact.toDecimalPlaces(2).toString(),
      comparisonMode: bestCandidate.comparisonMode,
      historyDays,
    });
  }

  return {
    spikes: spikes
      .sort((a, b) => {
        const sarCmp = new Prisma.Decimal(b.sarImpact).comparedTo(
          new Prisma.Decimal(a.sarImpact),
        );
        if (sarCmp !== 0) return sarCmp;
        const zCmp = new Prisma.Decimal(b.zScore).comparedTo(
          new Prisma.Decimal(a.zScore),
        );
        return zCmp !== 0 ? zCmp : a.menuItemId.localeCompare(b.menuItemId);
      })
      .slice(0, maxAlerts),
    coldStartItemIds,
    evaluatedItemCount,
  };
}
