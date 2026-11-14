import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  Prisma,
  Shift,
  Unit,
  WasteReason,
} from "@prisma/client";
import type { CostTier } from "@/features/insights";

export type DashboardRangeDays = 7 | 30 | 90;

export type ChangeDirection = "up" | "down" | "flat";

export interface RawDailyWasteRow {
  dateKey: string;
  wasteSar: Prisma.Decimal | string | number;
  entryCount: number;
}

export interface RawItemWasteRow {
  menuItemId: string;
  code: string | null;
  name: string;
  nameAr: string;
  unit: Unit;
  wasteQty: Prisma.Decimal | string | number;
  wasteSar: Prisma.Decimal | string | number;
  entryCount: number;
}

export interface RawHeatmapRow {
  weekday: number;
  shift: Shift;
  wasteSar: Prisma.Decimal | string | number;
  entryCount: number;
}

export interface RawReasonWasteRow {
  reason: WasteReason;
  wasteSar: Prisma.Decimal | string | number;
  entryCount: number;
}

export interface RawPurchaseSummaryRow {
  totalCostSar: Prisma.Decimal | string | number;
  recordCount: number;
}

export interface DashboardReasonRow {
  reason: WasteReason;
  sarCost: string;
  sharePct: string;
  entryCount: number;
}

export interface DashboardKpiSummary {
  rangeDays: DashboardRangeDays;
  periodStartDate: string;
  periodEndDate: string;
  prevStartDate: string;
  prevEndDate: string;
  totalWasteSar: string;
  prevWasteSar: string;
  wasteCostChangePct: string | null;
  wasteCostDirection: ChangeDirection;
  wasteEntryCount: number;
  prevWasteEntryCount: number;
  entryCountChangePct: string | null;
  entryCountDirection: ChangeDirection;
  hasPurchaseData: boolean;
  totalPurchaseSar: string;
  wasteAsPctOfPurchases: string | null;
  prevWasteAsPctOfPurchases: string | null;
  purchasePctChangePts: string | null;
  purchasePctDirection: ChangeDirection;
  topReason: DashboardReasonRow | null;
}

export interface DailyWasteTrendPoint {
  dateKey: string;
  wasteSar: string;
  movingAvg7dSar: string;
  entryCount: number;
}

export interface ItemWasteBarDatum {
  menuItemId: string;
  code: string | null;
  name: string;
  nameAr: string;
  unit: Unit;
  wasteQty: string;
  wasteSar: string;
  sharePct: string;
  tier: CostTier;
}

export interface HeatmapCell {
  weekday: number;
  shift: Shift;
  wasteSar: string;
  entryCount: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface DashboardAlertRow {
  id: string;
  menuItemId: string | null;
  type: AlertType;
  severity: AlertSeverity;
  messageKey: string;
  messageParams: Record<string, unknown>;
  status: AlertStatus;
  createdAtIso: string;
}

export interface RecommendationWhy {
  weekdayMean: string | null;
  eventMultiplier: string | null;
  eventScope: string | null;
  eventName: string | null;
  eventNameAr: string | null;
  trendFactor: string | null;
  sigma: string | null;
  criticalRatio: string | null;
  costOver: string | null;
  costUnder: string | null;
  safetyMarginQty: string | null;
}

export interface RecommendationDayCell {
  forDate: string;
  weekday: number;
  meanQty: string;
  lowQty: string;
  highQty: string;
  recommendedQty: string;
  safetyMarginQty: string;
  why: RecommendationWhy;
}

export interface RecommendationItemRow {
  menuItemId: string;
  code: string | null;
  name: string;
  nameAr: string;
  unit: Unit;
  status: "OK" | "INSUFFICIENT_DATA";
  distinctSalesDays: number;
  days: RecommendationDayCell[];
}

export interface OnboardingChecklist {
  isNewRestaurantEmpty: boolean;
  isComplete: boolean;
  completedCount: number;
  totalCount: number;
  hasMenuItems: boolean;
  hasKitchenStaff: boolean;
  hasSalesHistory: boolean;
  hasSalesOrPurchases: boolean;
  hasWasteEntries: boolean;
  hasInsightsReady: boolean;
}

export interface DashboardData {
  rangeDays: DashboardRangeDays;
  kpis: DashboardKpiSummary;
  dailyTrend: DailyWasteTrendPoint[];
  itemBars: ItemWasteBarDatum[];
  heatmap: {
    cells: HeatmapCell[];
    maxCellSar: string;
  };
  reasons: DashboardReasonRow[];
  alerts: DashboardAlertRow[];
  recommendations: {
    horizonDates: string[];
    items: RecommendationItemRow[];
  };
  checklist: OnboardingChecklist;
  serverLoadMs: number;
}
