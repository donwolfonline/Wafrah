import { Prisma, type Shift, type Unit, type WasteReason } from "@prisma/client";
import { type DecimalInput } from "@/features/insights";
import { toDecimal } from "@/features/insights/math";
import { buildCsvString } from "@/lib/csv";
import type {
  DailyReportCsvRow,
  ReportReasonRow,
  SavingsEstimateResult,
  SuggestedActionItem,
} from "./types";

export interface ActionItemSignalInput {
  menuItemId: string;
  name: string;
  nameAr: string;
  unit: Unit;
  monthWasteSar: DecimalInput;
  monthWasteQty: DecimalInput;
  baselineWeeklyWasteSar: DecimalInput;
  monthWeeks: DecimalInput;
  peakWeekday: number | null;
  peakWeekdayAvgQty: DecimalInput;
}

const REASON_RULE_KEY: Record<WasteReason, SuggestedActionItem["ruleKey"]> = {
  OVER_PREPARATION: "dominantReasonOverPrep",
  EXPIRED: "dominantReasonExpired",
  ORDER_ERROR: "dominantReasonOrderError",
  DAMAGED_IN_PREP: "dominantReasonDamaged",
  CUSTOMER_RETURN: "dominantReasonCustomerReturn",
  OTHER: "dominantReasonOther",
};

function roundSuggestedCut(rawQty: Prisma.Decimal, unit: Unit): string {
  if (unit === "PORTION" || unit === "PIECE") {
    return String(Math.max(1, Math.round(rawQty.toNumber())));
  }
  const snapped = Math.max(0.5, Math.round(rawQty.toNumber() * 2) / 2);
  return Number.isInteger(snapped) ? String(snapped) : snapped.toFixed(1);
}

export function generateSuggestedActions(params: {
  items: ActionItemSignalInput[];
  reasons: ReportReasonRow[];
  hotspotPeak: {
    weekday: number;
    shift: Shift;
    sarCost: string;
    entryCount: number;
  } | null;
  missingLoggingDaysCount: number;
  savings: SavingsEstimateResult;
}): SuggestedActionItem[] {
  const actions: SuggestedActionItem[] = [];

  // Rule 1: Highest percentage increase item -> peak weekday prep cut
  let bestSpike: {
    item: ActionItemSignalInput;
    pctChange: number;
    suggestedCut: string;
  } | null = null;

  for (const item of params.items) {
    const monthWasteSar = toDecimal(item.monthWasteSar);
    if (monthWasteSar.lte(0)) continue;
    const baseWeekly = toDecimal(item.baselineWeeklyWasteSar);
    if (baseWeekly.lte(0)) continue;

    const weeksDec = toDecimal(item.monthWeeks);
    const safeWeeks = weeksDec.gt(0) ? weeksDec : new Prisma.Decimal(1);
    const monthWeekly = monthWasteSar.div(safeWeeks);
    const pct = monthWeekly
      .sub(baseWeekly)
      .div(baseWeekly)
      .mul(100)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toNumber();

    if (pct >= 10 && (!bestSpike || pct > bestSpike.pctChange)) {
      const peakAvg = toDecimal(item.peakWeekdayAvgQty);
      const excessShare = monthWeekly.sub(baseWeekly).div(monthWeekly);
      const targetCut = peakAvg.mul(excessShare.gt(0.5) ? excessShare : new Prisma.Decimal("0.4"));
      bestSpike = {
        item,
        pctChange: pct,
        suggestedCut: roundSuggestedCut(targetCut, item.unit),
      };
    }
  }

  if (bestSpike && bestSpike.item.peakWeekday !== null) {
    actions.push({
      id: `item-spike-${bestSpike.item.menuItemId}`,
      ruleKey: "itemPeakReduction",
      params: {
        itemName: bestSpike.item.name,
        itemNameAr: bestSpike.item.nameAr,
        pctChange: bestSpike.pctChange,
        weekday: bestSpike.item.peakWeekday,
        suggestedCut: bestSpike.suggestedCut,
        unit: bestSpike.item.unit,
      },
    });
  } else if (params.items[0] && toDecimal(params.items[0].monthWasteSar).gt(0)) {
    const topItem = params.items[0];
    const peakAvg = toDecimal(topItem.peakWeekdayAvgQty);
    actions.push({
      id: `item-top-${topItem.menuItemId}`,
      ruleKey: "itemTopShareReduction",
      params: {
        itemName: topItem.name,
        itemNameAr: topItem.nameAr,
        weekday: topItem.peakWeekday ?? 4,
        suggestedCut: roundSuggestedCut(peakAvg.mul("0.25"), topItem.unit),
        unit: topItem.unit,
        sarCost: toDecimal(topItem.monthWasteSar).toFixed(2),
      },
    });
  }

  // Rule 2: Top waste reason action
  if (params.reasons[0] && toDecimal(params.reasons[0].sarCost).gt(0)) {
    const topReason = params.reasons[0];
    actions.push({
      id: `reason-${topReason.reason}`,
      ruleKey: REASON_RULE_KEY[topReason.reason],
      params: {
        sharePct: topReason.sharePct,
        sarCost: topReason.sarCost,
        entryCount: topReason.entryCount,
      },
    });
  }

  // Rule 3: Peak weekday x shift hotspot
  if (params.hotspotPeak && toDecimal(params.hotspotPeak.sarCost).gt(0)) {
    actions.push({
      id: "shift-hotspot",
      ruleKey: "shiftHotspot",
      params: {
        weekday: params.hotspotPeak.weekday,
        shift: params.hotspotPeak.shift,
        sarCost: params.hotspotPeak.sarCost,
        entryCount: params.hotspotPeak.entryCount,
      },
    });
  }

  // Rule 4 fallback: missing logging days OR sustain savings
  if (actions.length < 3 && params.missingLoggingDaysCount > 0) {
    actions.push({
      id: "logging-gap",
      ruleKey: "loggingGap",
      params: { daysCount: params.missingLoggingDaysCount },
    });
  }

  if (
    actions.length < 3 &&
    params.savings.status === "READY" &&
    params.savings.outcome === "SAVED"
  ) {
    actions.push({
      id: "sustain-reduction",
      ruleKey: "sustainReduction",
      params: { amountSar: params.savings.headlineAmountSar },
    });
  }

  return actions.slice(0, 3);
}

export function buildReportDailyCsv(
  rows: DailyReportCsvRow[],
  headers: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ],
): string {
  return buildCsvString(
    headers,
    rows.map((row) => [
      row.dateKey,
      row.wasteEntryCount,
      row.wasteQtySum,
      row.wasteSar,
      row.unitsSold,
      row.wasteSarPerUnit,
      row.purchaseSar,
    ]),
  );
}
