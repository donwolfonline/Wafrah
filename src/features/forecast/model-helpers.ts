import { Prisma } from "@prisma/client";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import {
  decimalMax,
  decimalMin,
  diffDateKeys,
  getDateKeyWeekday,
  inverseStandardNormalCdf,
  normalizeDateOnlyKey,
  resolveEventMultiplier,
  shiftDateKey,
  toDecimal,
  toTimeZoneDateKey,
} from "./math";
import type {
  ForecastEventEntry,
  ForecastInput,
  ForecastItemInput,
  ForecastItemResult,
  ForecastOptions,
} from "./types";

export interface ResolvedForecastParams {
  timeZone: string;
  horizonDays: number;
  minHistoryDays: number;
  ewmWeeks: number;
  ewmDecay: Prisma.Decimal;
  minWeekdaySamples: number;
  trendRecentDays: number;
  trendPrevDays: number;
  trendMin: Prisma.Decimal;
  trendMax: Prisma.Decimal;
  backtestWeeks: number;
  fallbackSigmaRatio: Prisma.Decimal;
  defaultShortageMultiplier: Prisma.Decimal;
}

export interface NewsvendorEconomics {
  costOver: Prisma.Decimal;
  costUnder: Prisma.Decimal;
  criticalRatio: Prisma.Decimal;
  zScore: Prisma.Decimal;
}

export function resolveForecastParams(
  options?: ForecastOptions,
): ResolvedForecastParams {
  return {
    timeZone: options?.timeZone ?? RIYADH_TIME_ZONE,
    horizonDays: options?.horizonDays ?? 7,
    minHistoryDays: options?.minHistoryDays ?? 14,
    ewmWeeks: options?.ewmWeeks ?? 8,
    ewmDecay: toDecimal(options?.ewmDecay ?? "0.8"),
    minWeekdaySamples: options?.minWeekdaySamples ?? 3,
    trendRecentDays: options?.trendRecentDays ?? 14,
    trendPrevDays: options?.trendPrevDays ?? 28,
    trendMin: toDecimal(options?.trendMin ?? "0.8"),
    trendMax: toDecimal(options?.trendMax ?? "1.25"),
    backtestWeeks: options?.backtestWeeks ?? 4,
    fallbackSigmaRatio: toDecimal(options?.fallbackSigmaRatio ?? "0.25"),
    defaultShortageMultiplier: toDecimal(
      options?.defaultShortageMultiplier ?? "1.5",
    ),
  };
}

export function decimalMean(values: Prisma.Decimal[]): Prisma.Decimal {
  if (values.length === 0) return new Prisma.Decimal(0);
  let sum = new Prisma.Decimal(0);
  for (const val of values) sum = sum.add(val);
  return sum.div(values.length);
}

export function buildCanonicalSalesByItem(input: ForecastInput) {
  const factorByItem = new Map<string, Prisma.Decimal>();
  for (const item of input.items) {
    factorByItem.set(item.id, toDecimal(item.salesUnitFactor ?? "1"));
  }

  const mapByItem = new Map<string, Map<string, Prisma.Decimal>>();
  let globalMaxDate: string | null = null;

  for (const row of input.sales) {
    const dateKey = normalizeDateOnlyKey(row.date);
    if (!globalMaxDate || dateKey > globalMaxDate) {
      globalMaxDate = dateKey;
    }
    const factor = factorByItem.get(row.menuItemId) ?? new Prisma.Decimal(1);
    const canonicalQty = decimalMax(
      new Prisma.Decimal(0),
      toDecimal(row.quantitySold).mul(factor),
    );
    let itemDates = mapByItem.get(row.menuItemId);
    if (!itemDates) {
      itemDates = new Map<string, Prisma.Decimal>();
      mapByItem.set(row.menuItemId, itemDates);
    }
    const prev = itemDates.get(dateKey) ?? new Prisma.Decimal(0);
    itemDates.set(dateKey, prev.add(canonicalQty));
  }

  return { mapByItem, globalMaxDate };
}

export function resolveForecastHorizons(
  input: ForecastInput,
  globalMaxDate: string | null,
  cfg: ResolvedForecastParams,
) {
  const options = input.options;
  const asOfKey = options?.asOfDate
    ? toTimeZoneDateKey(options.asOfDate, cfg.timeZone)
    : null;

  let historyEndDate: string | null = options?.historyEndDate ?? null;
  if (!historyEndDate && options?.forecastStartDate) {
    historyEndDate = shiftDateKey(options.forecastStartDate, -1);
  }
  if (!historyEndDate && asOfKey) {
    historyEndDate =
      globalMaxDate && globalMaxDate < asOfKey ? globalMaxDate : asOfKey;
  }
  if (!historyEndDate) {
    historyEndDate = globalMaxDate;
  }

  const forecastStartDate =
    options?.forecastStartDate ??
    (asOfKey && historyEndDate && historyEndDate < asOfKey
      ? asOfKey
      : historyEndDate
        ? shiftDateKey(historyEndDate, 1)
        : null);

  return { historyEndDate, forecastStartDate };
}

export function computePointMean(params: {
  itemSales: Array<{ dateKey: string; qty: Prisma.Decimal }>;
  events: ForecastEventEntry[];
  tenantId?: string;
  targetDateKey: string;
  historyCutoffKey: string;
  cfg: ResolvedForecastParams;
}) {
  const { itemSales, events, tenantId, targetDateKey, historyCutoffKey, cfg } =
    params;

  const lookbackStart = shiftDateKey(historyCutoffKey, -(cfg.ewmWeeks * 7 - 1));
  const windowSamples = itemSales.filter(
    (s) => s.dateKey >= lookbackStart && s.dateKey <= historyCutoffKey,
  );
  const targetWeekday = getDateKeyWeekday(targetDateKey);
  const weekdaySamples = windowSamples.filter(
    (s) => getDateKeyWeekday(s.dateKey) === targetWeekday,
  );

  let weekdayMean: Prisma.Decimal;
  let usedOverallFallback = false;

  if (weekdaySamples.length >= cfg.minWeekdaySamples) {
    const newestKey = weekdaySamples[weekdaySamples.length - 1]!.dateKey;
    let weightedSum = new Prisma.Decimal(0);
    let weightTotal = new Prisma.Decimal(0);
    for (const sample of weekdaySamples) {
      const daysDiff = diffDateKeys(sample.dateKey, newestKey);
      const weeksDiff = Math.round(daysDiff / 7);
      const weight = cfg.ewmDecay.pow(weeksDiff);
      weightedSum = weightedSum.add(sample.qty.mul(weight));
      weightTotal = weightTotal.add(weight);
    }
    weekdayMean = weightTotal.gt(0)
      ? weightedSum.div(weightTotal)
      : new Prisma.Decimal(0);
  } else {
    usedOverallFallback = true;
    const pool =
      windowSamples.length > 0
        ? windowSamples
        : itemSales.filter((s) => s.dateKey <= historyCutoffKey);
    weekdayMean = decimalMean(pool.map((s) => s.qty));
  }

  const recentStart = shiftDateKey(
    historyCutoffKey,
    -(cfg.trendRecentDays - 1),
  );
  const prevEnd = shiftDateKey(recentStart, -1);
  const prevStart = shiftDateKey(prevEnd, -(cfg.trendPrevDays - 1));

  const recentValues = itemSales
    .filter((s) => s.dateKey >= recentStart && s.dateKey <= historyCutoffKey)
    .map((s) => s.qty);
  const prevValues = itemSales
    .filter((s) => s.dateKey >= prevStart && s.dateKey <= prevEnd)
    .map((s) => s.qty);

  let rawTrendFactor = new Prisma.Decimal(1);
  let trendFactor = new Prisma.Decimal(1);

  if (recentValues.length > 0 && prevValues.length > 0) {
    const recentAvg = decimalMean(recentValues);
    const prevAvg = decimalMean(prevValues);
    if (prevAvg.gt(0)) {
      rawTrendFactor = recentAvg.div(prevAvg);
      trendFactor = decimalMin(
        cfg.trendMax,
        decimalMax(cfg.trendMin, rawTrendFactor),
      );
    } else if (recentAvg.gt(0)) {
      rawTrendFactor = cfg.trendMax;
      trendFactor = cfg.trendMax;
    }
  }

  const eventInfo = resolveEventMultiplier(targetDateKey, events, tenantId);
  const meanQty = decimalMax(
    new Prisma.Decimal(0),
    weekdayMean.mul(eventInfo.multiplier).mul(trendFactor),
  );

  return {
    meanQty,
    weekdayMean,
    weekdaySamplesCount: weekdaySamples.length,
    usedOverallFallback,
    trendFactor,
    rawTrendFactor,
    eventInfo,
  };
}

export function computeNewsvendorEconomics(
  item: ForecastItemInput,
  defaultShortageMultiplier: Prisma.Decimal,
): NewsvendorEconomics {
  const costOver = toDecimal(item.unitCost);
  const costUnder =
    item.shortageCost !== undefined && item.shortageCost !== null
      ? toDecimal(item.shortageCost)
      : costOver.mul(defaultShortageMultiplier);

  const denominator = costUnder.add(costOver);
  const criticalRatio = denominator.gt(0)
    ? costUnder.div(denominator)
    : new Prisma.Decimal("0.5");

  const crNum = Number(criticalRatio.toString());
  const clampedCr = Math.min(1 - 1e-6, Math.max(1e-6, crNum));
  const zScore = criticalRatio.lte(0)
    ? new Prisma.Decimal(0)
    : toDecimal(inverseStandardNormalCdf(clampedCr).toFixed(10));

  return { costOver, costUnder, criticalRatio, zScore };
}

export function buildInsufficientItemResult(
  item: ForecastItemInput,
  horizonDates: string[],
  historyDays: number,
  econ: NewsvendorEconomics,
): ForecastItemResult {
  return {
    menuItemId: item.id,
    itemCode: item.code ?? null,
    itemName: item.name,
    itemNameAr: item.nameAr,
    unit: item.unit,
    status: "INSUFFICIENT_DATA",
    historyDays,
    days: horizonDates.map((forDate) => ({
      menuItemId: item.id,
      itemCode: item.code ?? null,
      itemName: item.name,
      itemNameAr: item.nameAr,
      unit: item.unit,
      forDate,
      weekday: getDateKeyWeekday(forDate),
      status: "INSUFFICIENT_DATA",
      historyDays,
      meanQty: null,
      lowQty: null,
      highQty: null,
      sigma: null,
      recommendedQty: null,
      costOver: econ.costOver.toDecimalPlaces(2).toString(),
      costUnder: econ.costUnder.toDecimalPlaces(2).toString(),
      criticalRatio: econ.criticalRatio.toDecimalPlaces(4).toString(),
      zScore: econ.zScore.toDecimalPlaces(4).toString(),
      multipliers: null,
      weekdaySamples: 0,
      usedOverallFallback: false,
      backtestResidualsCount: 0,
      usedFallbackSigma: false,
    })),
  };
}
