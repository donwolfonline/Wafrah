import type {
  AlertSeverity,
  AlertStatus,
  Shift,
  Unit,
  WasteReason,
} from "@prisma/client";
import type { DecimalInput } from "@/features/insights";

export type SavingsStatus = "CALIBRATING" | "READY";
export type SavingsMethod = "VOLUME_ADJUSTED" | "RAW_WEEKLY";
export type SavingsOutcome = "SAVED" | "INCREASED" | "FLAT" | "CALIBRATING";

export interface BaselineWindow {
  startDate: string;
  endDate: string;
  days: number;
  isCustom: boolean;
  isCalibrating: boolean;
  calibratingDaysLeft: number;
}

export interface PeriodRawMetrics {
  startDate: string;
  endDate: string;
  days: number;
  wasteSar: DecimalInput;
  entryCount: number;
  unitsSold: DecimalInput;
  salesCount: number;
}

export interface SavingsPeriodSummary {
  startDate: string;
  endDate: string;
  days: number;
  weeks: string;
  totalWasteSar: string;
  weeklyWasteSar: string;
  entryCount: number;
  unitsSold: string;
  salesRecordCount: number;
  sarPerUnit: string | null;
}

export interface SavingsEstimateResult {
  isEstimate: true;
  status: SavingsStatus;
  calibratingDaysLeft: number;
  method: SavingsMethod;
  outcome: SavingsOutcome;
  headlineAmountSar: string;
  signedDeltaSar: string;
  isZeroBaseline: boolean;
  hasSalesForBothPeriods: boolean;
  expectedWasteAtBaselineSar: string;
  varianceSar: string;
  variancePct: string | null;
  volumeAdjustedSavingsSar: string | null;
  rawWeeklySavingsSar: string;
  baseline: SavingsPeriodSummary;
  current: SavingsPeriodSummary;
}

export interface ReportTopItemRow {
  menuItemId: string;
  code: string | null;
  name: string;
  nameAr: string;
  unit: Unit;
  wasteQty: string;
  wasteSar: string;
  sharePct: string;
  entryCount: number;
}

export interface ReportReasonRow {
  reason: WasteReason;
  sarCost: string;
  sharePct: string;
  entryCount: number;
}

export interface ReportAlertRow {
  id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  messageKey: string;
  messageParams: Record<string, unknown>;
  createdAtIso: string;
}

export interface RecommendationAdherenceResult {
  derivable: boolean;
  pairedDays: number;
  followedCount: number;
  ignoredCount: number;
  adherencePct: string | null;
  tolerancePct: number;
}

export interface SuggestedActionItem {
  id: string;
  ruleKey:
    | "itemPeakReduction"
    | "itemTopShareReduction"
    | "shiftHotspot"
    | "dominantReasonOverPrep"
    | "dominantReasonExpired"
    | "dominantReasonOrderError"
    | "dominantReasonDamaged"
    | "dominantReasonCustomerReturn"
    | "dominantReasonOther"
    | "loggingGap"
    | "sustainReduction";
  params: Record<string, string | number>;
}

export interface DailyReportCsvRow {
  dateKey: string;
  wasteEntryCount: number;
  wasteQtySum: string;
  wasteSar: string;
  unitsSold: string;
  wasteSarPerUnit: string;
  purchaseSar: string;
}

export interface ReportMonthSummary {
  yearMonth: string;
  monthStartDate: string;
  monthEndDate: string;
  wasteSar: string;
  wasteEntryCount: number;
  unitsSold: string;
  hasSalesData: boolean;
  savings: SavingsEstimateResult;
}

export interface MonthlyReportData {
  restaurant: {
    id: string;
    code: string;
    name: string;
    nameAr: string;
    city: string;
    timezone: string;
  };
  yearMonth: string;
  periodStartDate: string;
  periodEndDate: string;
  generatedAtIso: string;
  baselineWindow: BaselineWindow;
  savings: SavingsEstimateResult;
  topItems: ReportTopItemRow[];
  topReasons: ReportReasonRow[];
  alerts: ReportAlertRow[];
  adherence: RecommendationAdherenceResult;
  suggestedActions: SuggestedActionItem[];
  dailyRows: DailyReportCsvRow[];
  hotspotPeak: {
    weekday: number;
    shift: Shift;
    sarCost: string;
    entryCount: number;
  } | null;
}
