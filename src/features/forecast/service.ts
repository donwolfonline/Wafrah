import { Prisma } from "@prisma/client";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { createTenantDb, platformAdminDb } from "@/lib/tenant";
import { scoreForecasts } from "./accuracy";
import { shiftDateKey, toTimeZoneDateKey } from "./math";
import { StatisticalForecaster } from "./statistical-forecaster";
import type {
  DemandForecaster,
  ForecastDayPrediction,
  ForecastOutput,
  ScoreForecastsResult,
} from "./types";

const SALES_LOOKBACK_DAYS = 105;

export interface TenantForecastRunResult {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  method: string;
  historyEndDate: string | null;
  forecastStartDate: string | null;
  forecastEndDate: string | null;
  horizonDays: number;
  itemsEvaluated: number;
  persistedRows: number;
  insufficientDataItemIds: string[];
  accuracy: ScoreForecastsResult;
  output: ForecastOutput;
}

export interface AllTenantsForecastSummary {
  evaluatedAt: string;
  tenantCount: number;
  totalPersistedRows: number;
  tenants: TenantForecastRunResult[];
}

function buildInputsSnapshot(
  day: ForecastDayPrediction,
  output: ForecastOutput,
  accuracy: ScoreForecastsResult,
): Prisma.InputJsonObject {
  const itemAccuracy = accuracy.byItemId[day.menuItemId] ?? null;

  return {
    historyEndDate: output.historyEndDate,
    historyDays: day.historyDays,
    weekday: day.weekday,
    weekdaySamples: day.weekdaySamples,
    usedOverallFallback: day.usedOverallFallback,
    sigma: day.sigma,
    backtestResidualsCount: day.backtestResidualsCount,
    usedFallbackSigma: day.usedFallbackSigma,
    costOver: day.costOver,
    costUnder: day.costUnder,
    criticalRatio: day.criticalRatio,
    zScore: day.zScore,
    multipliers: day.multipliers
      ? ({
          weekdayMean: day.multipliers.weekdayMean,
          eventMultiplier: day.multipliers.eventMultiplier,
          eventScope: day.multipliers.eventScope,
          eventName: day.multipliers.eventName,
          eventNameAr: day.multipliers.eventNameAr,
          trendFactor: day.multipliers.trendFactor,
          rawTrendFactor: day.multipliers.rawTrendFactor,
        } satisfies Prisma.InputJsonObject)
      : null,
    parameters: { ...output.parameters } satisfies Prisma.InputJsonObject,
    historicalAccuracy: itemAccuracy
      ? ({
          matchedDays: itemAccuracy.matchedDays,
          wape: itemAccuracy.wape,
          wapePct: itemAccuracy.wapePct,
          mae: itemAccuracy.mae,
        } satisfies Prisma.InputJsonObject)
      : null,
  };
}

export async function runForecastsForTenant(
  tenantId: string,
  now: Date = new Date(),
  forecaster: DemandForecaster = new StatisticalForecaster(),
): Promise<TenantForecastRunResult> {
  const restaurant = await platformAdminDb.restaurant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { id: true, code: true, name: true, timezone: true },
  });

  const timeZone = restaurant.timezone || RIYADH_TIME_ZONE;
  const db = createTenantDb(tenantId);

  const todayKey = toTimeZoneDateKey(now, timeZone);
  const lookbackStartKey = shiftDateKey(todayKey, -SALES_LOOKBACK_DAYS);
  const lookbackStartUtc = new Date(`${lookbackStartKey}T00:00:00.000Z`);
  const todayUtc = new Date(`${todayKey}T00:00:00.000Z`);

  const [menuItems, salesRecords, eventRows] = await Promise.all([
    db.menuItem.findMany({
      where: { active: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        unit: true,
        salesUnitFactor: true,
        unitCost: true,
        shortageCost: true,
      },
    }),
    db.salesRecord.findMany({
      where: {
        date: { gte: lookbackStartUtc, lte: todayUtc },
      },
      select: {
        menuItemId: true,
        date: true,
        quantitySold: true,
      },
    }),
    db.eventCalendar.findMany({
      where: {
        endDate: { gte: lookbackStartUtc },
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        nameAr: true,
        startDate: true,
        endDate: true,
        demandMultiplier: true,
      },
    }),
  ]);

  const output = forecaster.forecast({
    tenantId,
    items: menuItems,
    sales: salesRecords,
    events: eventRows,
    options: {
      asOfDate: now,
      timeZone,
    },
  });

  const forecastStartDate = output.forecastStartDate;
  const forecastEndDate = output.forecastEndDate;
  const pastCutoffUtc = forecastStartDate
    ? new Date(`${forecastStartDate}T00:00:00.000Z`)
    : todayUtc;

  const pastForecasts = await db.forecastResult.findMany({
    where: {
      forDate: {
        gte: lookbackStartUtc,
        lt: pastCutoffUtc,
      },
    },
    select: {
      menuItemId: true,
      forDate: true,
      meanQty: true,
    },
  });

  const factorByItem = new Map(
    menuItems.map((item) => [item.id, item.salesUnitFactor]),
  );
  const accuracy = scoreForecasts(
    pastForecasts,
    salesRecords.map((s) => ({
      menuItemId: s.menuItemId,
      date: s.date,
      quantitySold: s.quantitySold,
      salesUnitFactor: factorByItem.get(s.menuItemId) ?? "1",
    })),
  );

  let persistedRows = 0;
  if (forecastStartDate && forecastEndDate) {
    const startUtc = new Date(`${forecastStartDate}T00:00:00.000Z`);
    const endUtc = new Date(`${forecastEndDate}T00:00:00.000Z`);

    await db.forecastResult.deleteMany({
      where: {
        forDate: {
          gte: startUtc,
          lte: endUtc,
        },
      },
    });

    const rowsToInsert = output.items
      .filter((item) => item.status === "OK")
      .flatMap((item) =>
        item.days
          .filter(
            (day) =>
              day.status === "OK" &&
              day.meanQty !== null &&
              day.lowQty !== null &&
              day.highQty !== null &&
              day.recommendedQty !== null,
          )
          .map((day) => ({
            tenantId,
            menuItemId: day.menuItemId,
            forDate: new Date(`${day.forDate}T00:00:00.000Z`),
            meanQty: new Prisma.Decimal(day.meanQty!),
            lowQty: new Prisma.Decimal(day.lowQty!),
            highQty: new Prisma.Decimal(day.highQty!),
            recommendedQty: new Prisma.Decimal(day.recommendedQty!),
            method: output.method,
            inputsSnapshot: buildInputsSnapshot(day, output, accuracy),
          })),
      );

    if (rowsToInsert.length > 0) {
      await db.forecastResult.createMany({
        data: rowsToInsert,
      });
      persistedRows = rowsToInsert.length;
    }
  }

  await db.auditLog.create({
    data: {
      tenantId,
      action: "FORECAST_RUN_COMPLETED",
      entity: "ForecastAccuracy",
      entityId: tenantId,
      metadata: {
        method: output.method,
        evaluatedAt: now.toISOString(),
        historyEndDate: output.historyEndDate,
        forecastStartDate: output.forecastStartDate,
        forecastEndDate: output.forecastEndDate,
        itemsEvaluated: output.items.length,
        persistedRows,
        insufficientDataItemIds: output.insufficientDataItemIds,
        overallWape: accuracy.overallWape,
        overallWapePct: accuracy.overallWapePct,
        totalMatchedPairs: accuracy.totalMatchedPairs,
      } satisfies Prisma.InputJsonObject,
    },
  });

  return {
    tenantId,
    tenantCode: restaurant.code,
    tenantName: restaurant.name,
    method: output.method,
    historyEndDate: output.historyEndDate,
    forecastStartDate: output.forecastStartDate,
    forecastEndDate: output.forecastEndDate,
    horizonDays: output.horizonDays,
    itemsEvaluated: output.items.length,
    persistedRows,
    insufficientDataItemIds: output.insufficientDataItemIds,
    accuracy,
    output,
  };
}

export async function runForecastsForAllTenants(
  now: Date = new Date(),
  forecaster: DemandForecaster = new StatisticalForecaster(),
): Promise<AllTenantsForecastSummary> {
  const restaurants = await platformAdminDb.restaurant.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const tenants: TenantForecastRunResult[] = [];
  for (const restaurant of restaurants) {
    const result = await runForecastsForTenant(restaurant.id, now, forecaster);
    tenants.push(result);
  }

  const totalPersistedRows = tenants.reduce(
    (sum, tenant) => sum + tenant.persistedRows,
    0,
  );

  return {
    evaluatedAt: now.toISOString(),
    tenantCount: tenants.length,
    totalPersistedRows,
    tenants,
  };
}
