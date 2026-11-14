import { toTimeZoneDateKey } from "@/features/insights";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import type { TenantPrismaClient } from "@/lib/tenant";
import {
  fetchFirstWasteDateSql,
  fetchPeriodSalesTotalSql,
  fetchPeriodWasteTotalSql,
  makeWasteSqlRange,
} from "./queries";
import { resolveBaselineWindow } from "./savings";

/** Loads the tenant restaurant metadata, active baseline window, and baseline metrics. */
export async function loadTenantBaselineContext(
  db: TenantPrismaClient,
  tenantId: string,
  now: Date,
) {
  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      nameAr: true,
      city: true,
      timezone: true,
      baselineStart: true,
      baselineEnd: true,
    },
  });
  const timeZone = restaurant.timezone || RIYADH_TIME_ZONE;
  const asOfDateKey = toTimeZoneDateKey(now, timeZone);
  const firstRows = await fetchFirstWasteDateSql(db, timeZone);

  const baselineWindow = resolveBaselineWindow({
    configuredStart: restaurant.baselineStart
      ? restaurant.baselineStart.toISOString().slice(0, 10)
      : null,
    configuredEnd: restaurant.baselineEnd
      ? restaurant.baselineEnd.toISOString().slice(0, 10)
      : null,
    firstWasteDate: firstRows[0]?.firstWasteDate ?? null,
    asOfDateKey,
  });

  const baseRange = makeWasteSqlRange(
    timeZone,
    baselineWindow.startDate,
    baselineWindow.endDate,
  );
  const [baseWasteRows, baseSalesRows] = await Promise.all([
    fetchPeriodWasteTotalSql(db, baseRange),
    fetchPeriodSalesTotalSql(
      db,
      baselineWindow.startDate,
      baselineWindow.endDate,
    ),
  ]);

  const baseWaste = baseWasteRows[0] ?? { wasteSar: "0", entryCount: 0 };
  const baseSales = baseSalesRows[0] ?? { unitsSold: "0", salesCount: 0 };

  return {
    restaurant: {
      id: restaurant.id,
      code: restaurant.code,
      name: restaurant.name,
      nameAr: restaurant.nameAr,
      city: restaurant.city,
      timezone: timeZone,
    },
    asOfDateKey,
    baselineWindow,
    baselineMetrics: {
      startDate: baselineWindow.startDate,
      endDate: baselineWindow.endDate,
      days: baselineWindow.days,
      wasteSar: baseWaste.wasteSar,
      entryCount: baseWaste.entryCount,
      unitsSold: baseSales.unitsSold,
      salesCount: baseSales.salesCount,
    },
  };
}
