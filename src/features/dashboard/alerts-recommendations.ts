import type { Unit } from "@prisma/client";
import type { DecimalInput } from "@/features/insights";
import { getDateKeyWeekday, toDecimal } from "@/features/insights/math";
import type {
  DashboardAlertRow,
  RecommendationDayCell,
  RecommendationItemRow,
  RecommendationWhy,
} from "./types";

const ALERT_SEVERITY_RANK: Record<DashboardAlertRow["severity"], number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

export function sortAlertsForDashboard(
  alerts: DashboardAlertRow[],
): DashboardAlertRow[] {
  return [...alerts].sort((a, b) => {
    const sevDiff =
      ALERT_SEVERITY_RANK[a.severity] - ALERT_SEVERITY_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;

    const unreadDiff =
      (a.status === "UNREAD" ? 0 : 1) - (b.status === "UNREAD" ? 0 : 1);
    if (unreadDiff !== 0) return unreadDiff;

    return b.createdAtIso.localeCompare(a.createdAtIso);
  });
}

function asSnapshotString(
  obj: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!obj) return null;
  const val = obj[key];
  return typeof val === "string" || typeof val === "number" ? String(val) : null;
}

export interface PersistedForecastInputRow {
  menuItemId: string;
  forDate: Date | string;
  meanQty: DecimalInput;
  lowQty: DecimalInput;
  highQty: DecimalInput;
  recommendedQty: DecimalInput;
  inputsSnapshot: unknown;
}

export function buildRecommendationsRows(params: {
  menuItems: Array<{
    id: string;
    code: string | null;
    name: string;
    nameAr: string;
    unit: Unit;
  }>;
  horizonDates: string[];
  forecasts: PersistedForecastInputRow[];
  salesDaysByItem: Record<string, number>;
}): RecommendationItemRow[] {
  const forecastLookup = new Map<string, PersistedForecastInputRow>();
  for (const row of params.forecasts) {
    const dateKey =
      typeof row.forDate === "string"
        ? row.forDate.slice(0, 10)
        : row.forDate.toISOString().slice(0, 10);
    forecastLookup.set(`${row.menuItemId}|${dateKey}`, row);
  }

  return params.menuItems.map((item) => {
    const distinctSalesDays = params.salesDaysByItem[item.id] ?? 0;
    const days: RecommendationDayCell[] = [];

    for (const dateKey of params.horizonDates) {
      const f = forecastLookup.get(`${item.id}|${dateKey}`);
      if (!f) continue;

      const meanDec = toDecimal(f.meanQty);
      const recDec = toDecimal(f.recommendedQty);
      const safetyDec = recDec.sub(meanDec).toDecimalPlaces(2);

      const snapshot =
        f.inputsSnapshot && typeof f.inputsSnapshot === "object"
          ? (f.inputsSnapshot as Record<string, unknown>)
          : null;
      const mult =
        snapshot?.multipliers && typeof snapshot.multipliers === "object"
          ? (snapshot.multipliers as Record<string, unknown>)
          : null;

      const why: RecommendationWhy = {
        weekdayMean: asSnapshotString(mult, "weekdayMean"),
        eventMultiplier: asSnapshotString(mult, "eventMultiplier"),
        eventScope: asSnapshotString(mult, "eventScope"),
        eventName: asSnapshotString(mult, "eventName"),
        eventNameAr: asSnapshotString(mult, "eventNameAr"),
        trendFactor: asSnapshotString(mult, "trendFactor"),
        sigma: asSnapshotString(snapshot, "sigma"),
        criticalRatio: asSnapshotString(snapshot, "criticalRatio"),
        costOver: asSnapshotString(snapshot, "costOver"),
        costUnder: asSnapshotString(snapshot, "costUnder"),
        safetyMarginQty: safetyDec.toString(),
      };

      days.push({
        forDate: dateKey,
        weekday: getDateKeyWeekday(dateKey),
        meanQty: meanDec.toDecimalPlaces(1).toString(),
        lowQty: toDecimal(f.lowQty).toDecimalPlaces(1).toString(),
        highQty: toDecimal(f.highQty).toDecimalPlaces(1).toString(),
        recommendedQty: recDec.toDecimalPlaces(1).toString(),
        safetyMarginQty: safetyDec.toString(),
        why,
      });
    }

    return {
      menuItemId: item.id,
      code: item.code,
      name: item.name,
      nameAr: item.nameAr,
      unit: item.unit,
      status: days.length > 0 ? "OK" : "INSUFFICIENT_DATA",
      distinctSalesDays,
      days,
    };
  });
}
