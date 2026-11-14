import type { Unit } from "@prisma/client";
import type { DecimalInput } from "@/features/insights/types";

export interface ForecastItemInput {
  id: string;
  code?: string | null;
  name: string;
  nameAr: string;
  unit: Unit;
  salesUnitFactor?: DecimalInput;
  unitCost: DecimalInput;
  shortageCost?: DecimalInput | null;
}

export interface ForecastSalesPoint {
  menuItemId: string;
  date: Date | string;
  quantitySold: DecimalInput;
}

export interface ForecastEventEntry {
  id?: string;
  tenantId?: string | null;
  name: string;
  nameAr?: string;
  startDate: Date | string;
  endDate: Date | string;
  demandMultiplier: DecimalInput;
}

export interface ForecastOptions {
  asOfDate?: Date | string;
  historyEndDate?: string;
  forecastStartDate?: string;
  horizonDays?: number;
  timeZone?: string;
  minHistoryDays?: number;
  ewmWeeks?: number;
  ewmDecay?: DecimalInput;
  minWeekdaySamples?: number;
  trendRecentDays?: number;
  trendPrevDays?: number;
  trendMin?: DecimalInput;
  trendMax?: DecimalInput;
  backtestWeeks?: number;
  fallbackSigmaRatio?: DecimalInput;
  defaultShortageMultiplier?: DecimalInput;
}

export interface ForecastInput {
  tenantId?: string;
  items: ForecastItemInput[];
  sales: ForecastSalesPoint[];
  events?: ForecastEventEntry[];
  options?: ForecastOptions;
}

export type ForecastDayStatus = "OK" | "INSUFFICIENT_DATA";

export interface ForecastMultipliers {
  weekdayMean: string;
  eventMultiplier: string;
  eventScope: "TENANT" | "GLOBAL" | "NONE";
  eventName: string | null;
  eventNameAr: string | null;
  trendFactor: string;
  rawTrendFactor: string;
}

export interface ForecastDayPrediction {
  menuItemId: string;
  itemCode: string | null;
  itemName: string;
  itemNameAr: string;
  unit: Unit;
  forDate: string;
  weekday: number;
  status: ForecastDayStatus;
  historyDays: number;
  meanQty: string | null;
  lowQty: string | null;
  highQty: string | null;
  sigma: string | null;
  recommendedQty: string | null;
  costOver: string;
  costUnder: string;
  criticalRatio: string;
  zScore: string;
  multipliers: ForecastMultipliers | null;
  weekdaySamples: number;
  usedOverallFallback: boolean;
  backtestResidualsCount: number;
  usedFallbackSigma: boolean;
}

export interface ForecastItemResult {
  menuItemId: string;
  itemCode: string | null;
  itemName: string;
  itemNameAr: string;
  unit: Unit;
  status: ForecastDayStatus;
  historyDays: number;
  days: ForecastDayPrediction[];
}

export interface ForecastOutput {
  method: string;
  historyEndDate: string | null;
  forecastStartDate: string | null;
  forecastEndDate: string | null;
  horizonDays: number;
  parameters: {
    minHistoryDays: number;
    ewmWeeks: number;
    ewmDecay: string;
    minWeekdaySamples: number;
    trendRecentDays: number;
    trendPrevDays: number;
    trendMin: string;
    trendMax: string;
    backtestWeeks: number;
    fallbackSigmaRatio: string;
    defaultShortageMultiplier: string;
  };
  items: ForecastItemResult[];
  insufficientDataItemIds: string[];
}

export interface DemandForecaster {
  readonly method: string;
  forecast(input: ForecastInput): ForecastOutput;
}

export interface AccuracyForecastPoint {
  menuItemId: string;
  forDate: Date | string;
  meanQty: DecimalInput;
}

export interface AccuracyActualPoint {
  menuItemId: string;
  date: Date | string;
  quantitySold: DecimalInput;
  salesUnitFactor?: DecimalInput;
}

export interface ItemAccuracyScore {
  menuItemId: string;
  matchedDays: number;
  totalActualQty: string;
  totalForecastQty: string;
  totalAbsError: string;
  wape: string | null;
  wapePct: string | null;
  mae: string | null;
}

export interface ScoreForecastsResult {
  overallWape: string | null;
  overallWapePct: string | null;
  totalMatchedPairs: number;
  items: ItemAccuracyScore[];
  byItemId: Record<string, ItemAccuracyScore>;
}
