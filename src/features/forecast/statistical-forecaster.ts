import { Prisma } from "@prisma/client";
import {
  decimalMax,
  decimalSampleStdDev,
  getDateKeyWeekday,
  roundToUnitStep,
  shiftDateKey,
} from "./math";
import {
  buildCanonicalSalesByItem,
  buildInsufficientItemResult,
  computeNewsvendorEconomics,
  computePointMean,
  type ResolvedForecastParams,
  resolveForecastHorizons,
  resolveForecastParams,
} from "./model-helpers";
import type {
  DemandForecaster,
  ForecastDayPrediction,
  ForecastEventEntry,
  ForecastInput,
  ForecastItemResult,
  ForecastOutput,
} from "./types";

interface SigmaEstimate {
  sigma: Prisma.Decimal;
  count: number;
  usedFallback: boolean;
}

function computeWeekdayBacktestSigma(params: {
  sortedSales: Array<{ dateKey: string; qty: Prisma.Decimal }>;
  events: ForecastEventEntry[];
  tenantId?: string;
  weekday: number;
  historyEndDate: string;
  backtestStart: string;
  currentMeanQty: Prisma.Decimal;
  cfg: ResolvedForecastParams;
}): SigmaEstimate {
  const {
    sortedSales,
    events,
    tenantId,
    weekday,
    historyEndDate,
    backtestStart,
    currentMeanQty,
    cfg,
  } = params;

  const residuals: Prisma.Decimal[] = [];
  for (const sample of sortedSales) {
    if (
      sample.dateKey < backtestStart ||
      sample.dateKey > historyEndDate ||
      getDateKeyWeekday(sample.dateKey) !== weekday
    ) {
      continue;
    }

    const subCutoff = shiftDateKey(sample.dateKey, -1);
    const priorCount = sortedSales.filter((s) => s.dateKey <= subCutoff).length;
    if (priorCount < cfg.minHistoryDays) continue;

    const backtestPred = computePointMean({
      itemSales: sortedSales,
      events,
      tenantId,
      targetDateKey: sample.dateKey,
      historyCutoffKey: subCutoff,
      cfg,
    });
    residuals.push(sample.qty.sub(backtestPred.meanQty));
  }

  if (residuals.length >= 2) {
    return {
      sigma: decimalSampleStdDev(residuals),
      count: residuals.length,
      usedFallback: false,
    };
  }

  return {
    sigma: currentMeanQty.mul(cfg.fallbackSigmaRatio),
    count: residuals.length,
    usedFallback: true,
  };
}

/**
 * Statistical demand forecaster combining exponentially weighted weekday
 * baselines, event multipliers, clamped trend adjustment, backtest residual
 * uncertainty, and Newsvendor critical-ratio optimization.
 */
export class StatisticalForecaster implements DemandForecaster {
  public readonly method = "STATISTICAL_EWM_NEWSVENDOR_V1";

  public forecast(input: ForecastInput): ForecastOutput {
    const cfg = resolveForecastParams(input.options);
    const events = input.events ?? [];
    const { mapByItem, globalMaxDate } = buildCanonicalSalesByItem(input);
    const { historyEndDate, forecastStartDate } = resolveForecastHorizons(
      input,
      globalMaxDate,
      cfg,
    );

    const horizonDates = forecastStartDate
      ? Array.from({ length: cfg.horizonDays }, (_, idx) =>
          shiftDateKey(forecastStartDate, idx),
        )
      : [];

    const itemResults: ForecastItemResult[] = [];
    const insufficientDataItemIds: string[] = [];

    for (const item of input.items) {
      const econ = computeNewsvendorEconomics(
        item,
        cfg.defaultShortageMultiplier,
      );
      const itemMap = mapByItem.get(item.id) ?? new Map<string, Prisma.Decimal>();
      const sortedSales = Array.from(itemMap.entries())
        .filter(([dateKey]) => !historyEndDate || dateKey <= historyEndDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, qty]) => ({ dateKey, qty }));

      const historyDays = sortedSales.length;

      if (!historyEndDate || historyDays < cfg.minHistoryDays) {
        insufficientDataItemIds.push(item.id);
        itemResults.push(
          buildInsufficientItemResult(item, horizonDates, historyDays, econ),
        );
        continue;
      }

      const days: ForecastDayPrediction[] = [];
      const backtestStart = shiftDateKey(
        historyEndDate,
        -(cfg.backtestWeeks * 7 - 1),
      );
      const sigmaCache = new Map<number, SigmaEstimate>();

      for (const forDate of horizonDates) {
        const weekday = getDateKeyWeekday(forDate);
        const point = computePointMean({
          itemSales: sortedSales,
          events,
          tenantId: input.tenantId,
          targetDateKey: forDate,
          historyCutoffKey: historyEndDate,
          cfg,
        });

        let sigmaInfo = sigmaCache.get(weekday);
        if (!sigmaInfo) {
          sigmaInfo = computeWeekdayBacktestSigma({
            sortedSales,
            events,
            tenantId: input.tenantId,
            weekday,
            historyEndDate,
            backtestStart,
            currentMeanQty: point.meanQty,
            cfg,
          });
          sigmaCache.set(weekday, sigmaInfo);
        }

        const sigma = sigmaInfo.usedFallback
          ? point.meanQty.mul(cfg.fallbackSigmaRatio)
          : sigmaInfo.sigma;

        const lowQty = decimalMax(
          new Prisma.Decimal(0),
          point.meanQty.sub(sigma),
        );
        const highQty = point.meanQty.add(sigma);
        const rawRec = econ.criticalRatio.lte(0)
          ? new Prisma.Decimal(0)
          : decimalMax(
              new Prisma.Decimal(0),
              point.meanQty.add(econ.zScore.mul(sigma)),
            );
        const recommendedQty = roundToUnitStep(rawRec, item.unit);

        days.push({
          menuItemId: item.id,
          itemCode: item.code ?? null,
          itemName: item.name,
          itemNameAr: item.nameAr,
          unit: item.unit,
          forDate,
          weekday,
          status: "OK",
          historyDays,
          meanQty: point.meanQty.toDecimalPlaces(3).toString(),
          lowQty: lowQty.toDecimalPlaces(3).toString(),
          highQty: highQty.toDecimalPlaces(3).toString(),
          sigma: sigma.toDecimalPlaces(3).toString(),
          recommendedQty: recommendedQty.toDecimalPlaces(3).toString(),
          costOver: econ.costOver.toDecimalPlaces(2).toString(),
          costUnder: econ.costUnder.toDecimalPlaces(2).toString(),
          criticalRatio: econ.criticalRatio.toDecimalPlaces(4).toString(),
          zScore: econ.zScore.toDecimalPlaces(4).toString(),
          multipliers: {
            weekdayMean: point.weekdayMean.toDecimalPlaces(3).toString(),
            eventMultiplier: point.eventInfo.multiplier
              .toDecimalPlaces(3)
              .toString(),
            eventScope: point.eventInfo.scope,
            eventName: point.eventInfo.eventName,
            eventNameAr: point.eventInfo.eventNameAr,
            trendFactor: point.trendFactor.toDecimalPlaces(4).toString(),
            rawTrendFactor: point.rawTrendFactor.toDecimalPlaces(4).toString(),
          },
          weekdaySamples: point.weekdaySamplesCount,
          usedOverallFallback: point.usedOverallFallback,
          backtestResidualsCount: sigmaInfo.count,
          usedFallbackSigma: sigmaInfo.usedFallback,
        });
      }

      itemResults.push({
        menuItemId: item.id,
        itemCode: item.code ?? null,
        itemName: item.name,
        itemNameAr: item.nameAr,
        unit: item.unit,
        status: "OK",
        historyDays,
        days,
      });
    }

    return {
      method: this.method,
      historyEndDate,
      forecastStartDate,
      forecastEndDate:
        horizonDates.length > 0 ? horizonDates[horizonDates.length - 1]! : null,
      horizonDays: cfg.horizonDays,
      parameters: {
        minHistoryDays: cfg.minHistoryDays,
        ewmWeeks: cfg.ewmWeeks,
        ewmDecay: cfg.ewmDecay.toString(),
        minWeekdaySamples: cfg.minWeekdaySamples,
        trendRecentDays: cfg.trendRecentDays,
        trendPrevDays: cfg.trendPrevDays,
        trendMin: cfg.trendMin.toString(),
        trendMax: cfg.trendMax.toString(),
        backtestWeeks: cfg.backtestWeeks,
        fallbackSigmaRatio: cfg.fallbackSigmaRatio.toString(),
        defaultShortageMultiplier: cfg.defaultShortageMultiplier.toString(),
      },
      items: itemResults,
      insufficientDataItemIds,
    };
  }
}
