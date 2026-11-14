import { Prisma } from "@prisma/client";
import { decimalMax, normalizeDateOnlyKey, toDecimal } from "./math";
import type {
  AccuracyActualPoint,
  AccuracyForecastPoint,
  ItemAccuracyScore,
  ScoreForecastsResult,
} from "./types";

interface ItemAccumulator {
  matchedDays: number;
  actualSum: Prisma.Decimal;
  forecastSum: Prisma.Decimal;
  absErrorSum: Prisma.Decimal;
}

/**
 * Computes Weighted Absolute Percentage Error (WAPE) per item and across
 * all items from historical forecasts that now have actual sales records.
 */
export function scoreForecasts(
  forecasts: AccuracyForecastPoint[],
  actuals: AccuracyActualPoint[],
): ScoreForecastsResult {
  const actualsByItemDate = new Map<string, Map<string, Prisma.Decimal>>();

  for (const actual of actuals) {
    const dateKey = normalizeDateOnlyKey(actual.date);
    const factor = toDecimal(actual.salesUnitFactor ?? "1");
    const canonicalActual = decimalMax(
      new Prisma.Decimal(0),
      toDecimal(actual.quantitySold).mul(factor),
    );

    let itemMap = actualsByItemDate.get(actual.menuItemId);
    if (!itemMap) {
      itemMap = new Map<string, Prisma.Decimal>();
      actualsByItemDate.set(actual.menuItemId, itemMap);
    }
    const prev = itemMap.get(dateKey) ?? new Prisma.Decimal(0);
    itemMap.set(dateKey, prev.add(canonicalActual));
  }

  const accByItem = new Map<string, ItemAccumulator>();
  let portfolioActual = new Prisma.Decimal(0);
  let portfolioAbsError = new Prisma.Decimal(0);
  let totalMatchedPairs = 0;

  for (const forecast of forecasts) {
    const dateKey = normalizeDateOnlyKey(forecast.forDate);
    const actualQty = actualsByItemDate.get(forecast.menuItemId)?.get(dateKey);
    if (actualQty === undefined) continue;

    const forecastQty = decimalMax(
      new Prisma.Decimal(0),
      toDecimal(forecast.meanQty),
    );
    const absError = actualQty.sub(forecastQty).abs();

    totalMatchedPairs += 1;
    portfolioActual = portfolioActual.add(actualQty);
    portfolioAbsError = portfolioAbsError.add(absError);

    const prev = accByItem.get(forecast.menuItemId);
    if (prev) {
      prev.matchedDays += 1;
      prev.actualSum = prev.actualSum.add(actualQty);
      prev.forecastSum = prev.forecastSum.add(forecastQty);
      prev.absErrorSum = prev.absErrorSum.add(absError);
    } else {
      accByItem.set(forecast.menuItemId, {
        matchedDays: 1,
        actualSum: actualQty,
        forecastSum: forecastQty,
        absErrorSum: absError,
      });
    }
  }

  const items: ItemAccuracyScore[] = [];
  const byItemId: Record<string, ItemAccuracyScore> = {};

  for (const [menuItemId, acc] of Array.from(accByItem.entries()).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    let wape: string | null = null;
    let wapePct: string | null = null;

    if (acc.actualSum.gt(0)) {
      const ratio = acc.absErrorSum.div(acc.actualSum);
      wape = ratio.toDecimalPlaces(4).toString();
      wapePct = ratio.mul(100).toDecimalPlaces(1).toString();
    } else if (acc.absErrorSum.eq(0)) {
      wape = "0";
      wapePct = "0";
    }

    const score: ItemAccuracyScore = {
      menuItemId,
      matchedDays: acc.matchedDays,
      totalActualQty: acc.actualSum.toDecimalPlaces(3).toString(),
      totalForecastQty: acc.forecastSum.toDecimalPlaces(3).toString(),
      totalAbsError: acc.absErrorSum.toDecimalPlaces(3).toString(),
      wape,
      wapePct,
      mae: acc.absErrorSum.div(acc.matchedDays).toDecimalPlaces(3).toString(),
    };
    items.push(score);
    byItemId[menuItemId] = score;
  }

  let overallWape: string | null = null;
  let overallWapePct: string | null = null;
  if (totalMatchedPairs > 0) {
    if (portfolioActual.gt(0)) {
      const ratio = portfolioAbsError.div(portfolioActual);
      overallWape = ratio.toDecimalPlaces(4).toString();
      overallWapePct = ratio.mul(100).toDecimalPlaces(1).toString();
    } else if (portfolioAbsError.eq(0)) {
      overallWape = "0";
      overallWapePct = "0";
    }
  }

  return {
    overallWape,
    overallWapePct,
    totalMatchedPairs,
    items,
    byItemId,
  };
}
