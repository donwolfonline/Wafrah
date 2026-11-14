import type { AlertSeverity, Prisma, Unit, WasteReason } from "@prisma/client";

export type DecimalInput = Prisma.Decimal | number | string;

export interface InsightMenuItem {
  id: string;
  code: string | null;
  name: string;
  nameAr: string;
  unit: Unit;
  unitCost: DecimalInput;
  active?: boolean;
}

export interface InsightWasteEntry {
  id?: string;
  menuItemId: string;
  quantity: DecimalInput;
  reason: WasteReason;
  occurredAt: Date | string;
  deletedAt?: Date | string | null;
}

export interface InsightSalesRecord {
  date: Date | string;
  menuItemId?: string;
  quantitySold?: DecimalInput;
}

export interface DailyItemWaste {
  menuItemId: string;
  dateKey: string;
  weekday: number;
  quantity: string;
  sarCost: string;
  entryCount: number;
}

export interface ItemAggregateTotal {
  menuItemId: string;
  totalQuantity: string;
  totalSarCost: string;
  entryCount: number;
  daysLogged: number;
}

export interface ReasonWasteSummary {
  reason: WasteReason;
  quantity: string;
  sarCost: string;
  entryCount: number;
  sharePct: string;
}

export interface AggregateWasteResult {
  dailyByItem: DailyItemWaste[];
  byReason: ReasonWasteSummary[];
  totalsByItem: Record<string, ItemAggregateTotal>;
  totalQuantity: string;
  totalSarCost: string;
  totalEntries: number;
  loggedDateKeys: string[];
}

export interface SpikeSeriesPoint {
  menuItemId: string;
  dateKey: string;
  quantity: DecimalInput;
  sarCost?: DecimalInput;
}

export interface SpikeSeriesItemMeta {
  id: string;
  code?: string | null;
  name: string;
  nameAr: string;
  unit: Unit;
  unitCost: DecimalInput;
}

export interface DetectSpikesOptions {
  asOfDate?: string;
  recentDays?: number;
  baselineDays?: number;
  minHistoryDays?: number;
  fullHistoryDays?: number;
  minWeekdaySamples?: number;
  warningZ?: number;
  criticalZ?: number;
  minAbsQtyChange?: DecimalInput;
  minAbsSarChange?: DecimalInput;
  maxAlerts?: number;
}

export type ComparisonMode = "WEEKDAY" | "OVERALL" | "MIXED";

export interface DetectedSpike {
  menuItemId: string;
  itemCode: string | null;
  itemName: string;
  itemNameAr: string;
  unit: Unit;
  severity: Extract<AlertSeverity, "WARNING" | "CRITICAL">;
  windowEndDate: string;
  baseline: string;
  observed: string;
  zScore: string;
  percentageChange: string | null;
  absQtyChange: string;
  sarImpact: string;
  comparisonMode: ComparisonMode;
  historyDays: number;
}

export interface DetectSpikesResult {
  spikes: DetectedSpike[];
  coldStartItemIds: string[];
  evaluatedItemCount: number;
}

export type CostTier = "HIGH" | "MEDIUM" | "LOW";

export interface WasteByItemCostInput {
  menuItemId: string;
  sarCost: DecimalInput;
  quantity?: DecimalInput;
}

export interface ClassifiedWasteItem {
  menuItemId: string;
  sarCost: string;
  sharePct: string;
  cumulativeSharePct: string;
  tier: CostTier;
}

export interface DataGapItem {
  dateKey: string;
}
