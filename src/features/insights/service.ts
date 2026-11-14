import { type AlertSeverity, type AlertType, Prisma } from "@prisma/client";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { createTenantDb, platformAdminDb } from "@/lib/tenant";
import { aggregateWaste, classifyItems, dataGaps, topReasons } from "./aggregators";
import { shiftDateKey, toDecimal, toTimeZoneDateKey } from "./math";
import { detectSpikes } from "./spike-detector";
import type {
  ClassifiedWasteItem,
  DataGapItem,
  DetectedSpike,
  ReasonWasteSummary,
} from "./types";

const MAX_ALERTS_PER_RUN = 5;

export interface PersistedAlertSummary {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  menuItemId: string | null;
  dedupeKey: string;
  messageKey: string;
  messageParams: Record<string, unknown>;
}

export interface TenantInsightsResult {
  tenantId: string;
  tenantCode?: string;
  windowEndDate: string;
  totalWasteSar28d: string;
  spikes: DetectedSpike[];
  dataGaps: DataGapItem[];
  topReasons: ReasonWasteSummary[];
  itemTiers: ClassifiedWasteItem[];
  persistedAlerts: PersistedAlertSummary[];
}

export interface AllTenantsInsightsSummary {
  evaluatedAt: string;
  tenantCount: number;
  totalAlertsUpserted: number;
  tenants: TenantInsightsResult[];
}

function buildSpikeAlertPayload(spike: DetectedSpike) {
  const dedupeKey = `WASTE_SPIKE:${spike.menuItemId}:${spike.windowEndDate}`;
  const isFromZero = spike.percentageChange === null;
  const messageKey = isFromZero
    ? "insights.alerts.wasteSpikeFromZero"
    : "insights.alerts.wasteSpike";

  const messageParams: Prisma.InputJsonObject = {
    itemName: spike.itemName,
    itemNameAr: spike.itemNameAr,
    itemCode: spike.itemCode ?? spike.menuItemId,
    unit: spike.unit,
    baseline: spike.baseline,
    observed: spike.observed,
    zScore: spike.zScore,
    percentageChange: spike.percentageChange ?? "0",
    absQtyChange: spike.absQtyChange,
    sarImpact: spike.sarImpact,
    windowEndDate: spike.windowEndDate,
    comparisonMode: spike.comparisonMode,
  };

  return {
    menuItemId: spike.menuItemId,
    type: "WASTE_SPIKE" as const,
    severity: spike.severity,
    messageKey,
    messageParams,
    dedupeKey,
  };
}

function buildDataGapAlertPayload(gap: DataGapItem) {
  return {
    menuItemId: null,
    type: "DATA_GAP" as const,
    severity: "INFO" as const,
    messageKey: "insights.alerts.dataGap",
    messageParams: {
      date: gap.dateKey,
    } satisfies Prisma.InputJsonObject,
    dedupeKey: `DATA_GAP:NONE:${gap.dateKey}`,
  };
}

export async function runInsightsForTenant(
  tenantId: string,
  now: Date = new Date(),
): Promise<TenantInsightsResult> {
  const restaurant = await platformAdminDb.restaurant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { id: true, code: true, timezone: true },
  });

  const timeZone = restaurant.timezone || RIYADH_TIME_ZONE;
  const db = createTenantDb(tenantId);

  const todayKey = toTimeZoneDateKey(now, timeZone);
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const lookbackStartKey = shiftDateKey(todayKey, -65);
  const lookbackStartUtc = new Date(`${lookbackStartKey}T00:00:00.000Z`);
  const salesLookbackStartUtc = new Date(
    `${shiftDateKey(todayKey, -14)}T00:00:00.000Z`,
  );

  const [menuItems, wasteEntries, salesRecords] = await Promise.all([
    db.menuItem.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        unit: true,
        unitCost: true,
        active: true,
      },
    }),
    db.wasteEntry.findMany({
      where: {
        deletedAt: null,
        occurredAt: { gte: lookbackStartUtc, lte: now },
      },
      select: {
        id: true,
        menuItemId: true,
        quantity: true,
        reason: true,
        occurredAt: true,
        deletedAt: true,
      },
    }),
    db.salesRecord.findMany({
      where: {
        date: { gte: salesLookbackStartUtc, lte: new Date(`${todayKey}T00:00:00.000Z`) },
      },
      select: { date: true },
      distinct: ["date"],
    }),
  ]);

  const agg = aggregateWaste(wasteEntries, menuItems, timeZone);
  const wasteDates = new Set(agg.loggedDateKeys);
  const salesDates = new Set(
    salesRecords.map((r) => r.date.toISOString().slice(0, 10)),
  );

  let windowEndDate = todayKey;
  if (!wasteDates.has(todayKey) && !salesDates.has(todayKey)) {
    if (wasteDates.has(yesterdayKey) || salesDates.has(yesterdayKey)) {
      windowEndDate = yesterdayKey;
    }
  }

  const spikeResult = detectSpikes(
    {
      dailySeries: agg.dailyByItem,
      items: menuItems,
    },
    { asOfDate: windowEndDate, maxAlerts: MAX_ALERTS_PER_RUN },
  );

  const gapCheckStart = shiftDateKey(windowEndDate, -6);
  const recentExpectedSales = salesRecords.filter((r) => {
    const dk = r.date.toISOString().slice(0, 10);
    return dk >= gapCheckStart && dk <= windowEndDate;
  });
  const recentGaps = dataGaps(wasteEntries, recentExpectedSales, {
    timeZone,
    maxDateKey: windowEndDate,
  });

  const itemTiers = classifyItems(agg.dailyByItem, {
    asOfDate: windowEndDate,
    windowDays: 28,
  });

  const window28Start = shiftDateKey(windowEndDate, -27);
  const waste28Entries = wasteEntries.filter((entry) => {
    const dk = toTimeZoneDateKey(entry.occurredAt, timeZone);
    return dk >= window28Start && dk <= windowEndDate;
  });
  const rankedReasons = topReasons(waste28Entries, menuItems);
  const waste28TotalSar = itemTiers
    .reduce(
      (sum, item) => sum.add(toDecimal(item.sarCost)),
      new Prisma.Decimal(0),
    )
    .toDecimalPlaces(2)
    .toString();

  const candidates = [
    ...spikeResult.spikes.map(buildSpikeAlertPayload),
    ...recentGaps.map(buildDataGapAlertPayload),
  ].slice(0, MAX_ALERTS_PER_RUN);

  const persistedAlerts: PersistedAlertSummary[] = [];

  for (const candidate of candidates) {
    const saved = await db.alert.upsert({
      where: {
        tenantId_dedupeKey: {
          tenantId,
          dedupeKey: candidate.dedupeKey,
        },
      },
      create: {
        tenantId,
        menuItemId: candidate.menuItemId,
        type: candidate.type,
        severity: candidate.severity,
        messageKey: candidate.messageKey,
        messageParams: candidate.messageParams,
        status: "UNREAD",
        dedupeKey: candidate.dedupeKey,
      },
      update: {
        menuItemId: candidate.menuItemId,
        severity: candidate.severity,
        messageKey: candidate.messageKey,
        messageParams: candidate.messageParams,
      },
      select: {
        id: true,
        type: true,
        severity: true,
        menuItemId: true,
        dedupeKey: true,
        messageKey: true,
        messageParams: true,
      },
    });

    persistedAlerts.push({
      id: saved.id,
      type: saved.type,
      severity: saved.severity,
      menuItemId: saved.menuItemId,
      dedupeKey: saved.dedupeKey,
      messageKey: saved.messageKey,
      messageParams: saved.messageParams as Record<string, unknown>,
    });
  }

  return {
    tenantId,
    tenantCode: restaurant.code,
    windowEndDate,
    totalWasteSar28d: waste28TotalSar,
    spikes: spikeResult.spikes,
    dataGaps: recentGaps,
    topReasons: rankedReasons,
    itemTiers,
    persistedAlerts,
  };
}

export async function runInsightsForAllTenants(
  now: Date = new Date(),
): Promise<AllTenantsInsightsSummary> {
  const restaurants = await platformAdminDb.restaurant.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const tenants: TenantInsightsResult[] = [];
  for (const restaurant of restaurants) {
    const result = await runInsightsForTenant(restaurant.id, now);
    tenants.push(result);
  }

  const totalAlertsUpserted = tenants.reduce(
    (sum, t) => sum + t.persistedAlerts.length,
    0,
  );

  return {
    evaluatedAt: now.toISOString(),
    tenantCount: tenants.length,
    totalAlertsUpserted,
    tenants,
  };
}
