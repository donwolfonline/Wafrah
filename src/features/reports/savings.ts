import { Prisma } from "@prisma/client";
import {
  type DecimalInput,
  shiftDateKey,
} from "@/features/insights";
import { diffDateKeys, toDecimal } from "@/features/insights/math";
import type {
  BaselineWindow,
  PeriodRawMetrics,
  RecommendationAdherenceResult,
  SavingsEstimateResult,
  SavingsMethod,
  SavingsOutcome,
} from "./types";

const DEFAULT_BASELINE_DAYS = 14;
const DEFAULT_ADHERENCE_TOLERANCE = new Prisma.Decimal("0.15");

export function resolveBaselineWindow(params: {
  configuredStart: string | null;
  configuredEnd: string | null;
  firstWasteDate: string | null;
  asOfDateKey: string;
}): BaselineWindow {
  const hasCustom = Boolean(params.configuredStart && params.configuredEnd);
  if (hasCustom) {
    const start = params.configuredStart!;
    const end =
      params.configuredEnd! >= start ? params.configuredEnd! : start;
    const days = Math.max(1, diffDateKeys(start, end) + 1);
    const daysLeft = Math.max(0, diffDateKeys(params.asOfDateKey, end));
    return {
      startDate: start,
      endDate: end,
      days,
      isCustom: true,
      isCalibrating: daysLeft > 0,
      calibratingDaysLeft: daysLeft,
    };
  }

  if (!params.firstWasteDate) {
    return {
      startDate: params.asOfDateKey,
      endDate: shiftDateKey(params.asOfDateKey, DEFAULT_BASELINE_DAYS - 1),
      days: DEFAULT_BASELINE_DAYS,
      isCustom: false,
      isCalibrating: true,
      calibratingDaysLeft: DEFAULT_BASELINE_DAYS,
    };
  }

  const start = params.firstWasteDate;
  const end = shiftDateKey(start, DEFAULT_BASELINE_DAYS - 1);
  const daysLeft = Math.max(0, diffDateKeys(params.asOfDateKey, end));

  return {
    startDate: start,
    endDate: end,
    days: DEFAULT_BASELINE_DAYS,
    isCustom: false,
    isCalibrating: daysLeft > 0,
    calibratingDaysLeft: daysLeft,
  };
}

function summarizePeriod(metrics: PeriodRawMetrics) {
  const days = Math.max(1, metrics.days);
  const weeks = new Prisma.Decimal(days).div(7);
  const waste = toDecimal(metrics.wasteSar);
  const weeklyWaste = waste.div(weeks);
  const units = toDecimal(metrics.unitsSold);
  const hasUnits = metrics.salesCount > 0 && units.gt(0);

  return {
    summary: {
      startDate: metrics.startDate,
      endDate: metrics.endDate,
      days,
      weeks: weeks.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
      totalWasteSar: waste.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
      weeklyWasteSar: weeklyWaste.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
      entryCount: metrics.entryCount,
      unitsSold: units.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
      salesRecordCount: metrics.salesCount,
      sarPerUnit: hasUnits
        ? waste.div(units).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4)
        : null,
    },
    weeksDec: weeks,
    wasteDec: waste,
    weeklyWasteDec: weeklyWaste,
    unitsDec: units,
    hasUnits,
    ratioDec: hasUnits ? waste.div(units) : null,
  };
}

export function calculateMonthlySavings(params: {
  baselineWindow: BaselineWindow;
  baselineMetrics: PeriodRawMetrics;
  currentMetrics: PeriodRawMetrics;
}): SavingsEstimateResult {
  const base = summarizePeriod(params.baselineMetrics);
  const curr = summarizePeriod(params.currentMetrics);

  const hasSalesForBothPeriods = base.hasUnits && curr.hasUnits;
  const rawWeeklySavingsDec = base.weeklyWasteDec
    .sub(curr.weeklyWasteDec)
    .mul(curr.weeksDec);

  const volumeAdjustedSavingsDec = hasSalesForBothPeriods
    ? base.ratioDec!.sub(curr.ratioDec!).mul(curr.unitsDec)
    : null;

  const isZeroBaseline = base.wasteDec.eq(0);
  const preferredMethod: SavingsMethod = hasSalesForBothPeriods
    ? "VOLUME_ADJUSTED"
    : "RAW_WEEKLY";

  const expectedDec = hasSalesForBothPeriods
    ? base.ratioDec!.mul(curr.unitsDec)
    : base.weeklyWasteDec.mul(curr.weeksDec);

  const varianceDec = curr.wasteDec.sub(expectedDec);
  const variancePct = expectedDec.gt(0)
    ? varianceDec.div(expectedDec).mul(100).toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP).toString()
    : null;

  if (params.baselineWindow.isCalibrating) {
    return {
      isEstimate: true,
      status: "CALIBRATING",
      calibratingDaysLeft: params.baselineWindow.calibratingDaysLeft,
      method: preferredMethod,
      outcome: "CALIBRATING",
      headlineAmountSar: "0.00",
      signedDeltaSar: "0.00",
      isZeroBaseline,
      hasSalesForBothPeriods,
      expectedWasteAtBaselineSar: expectedDec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
      varianceSar: varianceDec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
      variancePct,
      volumeAdjustedSavingsSar: volumeAdjustedSavingsDec
        ? volumeAdjustedSavingsDec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2)
        : null,
      rawWeeklySavingsSar: rawWeeklySavingsDec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
      baseline: base.summary,
      current: curr.summary,
    };
  }

  const chosenSavingsDec = volumeAdjustedSavingsDec ?? rawWeeklySavingsDec;
  const roundedDelta = chosenSavingsDec.toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP,
  );

  const outcome: SavingsOutcome = roundedDelta.gt(0)
    ? "SAVED"
    : roundedDelta.lt(0)
      ? "INCREASED"
      : "FLAT";

  return {
    isEstimate: true,
    status: "READY",
    calibratingDaysLeft: 0,
    method: preferredMethod,
    outcome,
    headlineAmountSar: roundedDelta.abs().toFixed(2),
    signedDeltaSar: roundedDelta.toFixed(2),
    isZeroBaseline,
    hasSalesForBothPeriods,
    expectedWasteAtBaselineSar: expectedDec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
    varianceSar: varianceDec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
    variancePct,
    volumeAdjustedSavingsSar: volumeAdjustedSavingsDec
      ? volumeAdjustedSavingsDec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2)
      : null,
    rawWeeklySavingsSar: rawWeeklySavingsDec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
    baseline: base.summary,
    current: curr.summary,
  };
}

export function computeRecommendationAdherence(params: {
  forecasts: Array<{
    menuItemId: string;
    dateKey: string;
    recommendedQty: DecimalInput;
  }>;
  purchases: Array<{
    menuItemId: string;
    dateKey: string;
    quantity: DecimalInput;
  }>;
  toleranceRatio?: Prisma.Decimal;
}): RecommendationAdherenceResult {
  const tolerance = params.toleranceRatio ?? DEFAULT_ADHERENCE_TOLERANCE;
  const purchaseMap = new Map<string, Prisma.Decimal>();
  for (const p of params.purchases) {
    const key = `${p.menuItemId}|${p.dateKey}`;
    const prev = purchaseMap.get(key) ?? new Prisma.Decimal(0);
    purchaseMap.set(key, prev.add(toDecimal(p.quantity)));
  }

  let pairedDays = 0;
  let followedCount = 0;
  let ignoredCount = 0;

  for (const f of params.forecasts) {
    const recQty = toDecimal(f.recommendedQty);
    if (recQty.lte(0)) continue;
    const actualQty = purchaseMap.get(`${f.menuItemId}|${f.dateKey}`);
    if (!actualQty || actualQty.lte(0)) continue;

    pairedDays += 1;
    const relativeError = actualQty.sub(recQty).abs().div(recQty);
    if (relativeError.lte(tolerance)) {
      followedCount += 1;
    } else {
      ignoredCount += 1;
    }
  }

  if (pairedDays === 0) {
    return {
      derivable: false,
      pairedDays: 0,
      followedCount: 0,
      ignoredCount: 0,
      adherencePct: null,
      tolerancePct: tolerance.mul(100).toNumber(),
    };
  }

  const adherencePct = new Prisma.Decimal(followedCount)
    .div(pairedDays)
    .mul(100)
    .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
    .toString();

  return {
    derivable: true,
    pairedDays,
    followedCount,
    ignoredCount,
    adherencePct,
    tolerancePct: tolerance.mul(100).toNumber(),
  };
}
