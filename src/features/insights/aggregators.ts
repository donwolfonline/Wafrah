import { Prisma, type WasteReason } from "@prisma/client";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { shiftDateKey, toTimeZoneDateKey, toDecimal } from "./math";
import type {
  AggregateWasteResult,
  ClassifiedWasteItem,
  CostTier,
  DailyItemWaste,
  DataGapItem,
  DecimalInput,
  InsightMenuItem,
  InsightSalesRecord,
  InsightWasteEntry,
  ItemAggregateTotal,
  ReasonWasteSummary,
  WasteByItemCostInput,
} from "./types";

interface DailyAccumulator {
  menuItemId: string;
  dateKey: string;
  weekday: number;
  qty: Prisma.Decimal;
  cost: Prisma.Decimal;
  entryCount: number;
}

interface ItemAccumulator {
  menuItemId: string;
  qty: Prisma.Decimal;
  cost: Prisma.Decimal;
  entryCount: number;
  dates: Set<string>;
}

export function aggregateWaste(
  entries: InsightWasteEntry[],
  items: InsightMenuItem[],
  timeZone: string = RIYADH_TIME_ZONE,
): AggregateWasteResult {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const dailyMap = new Map<string, DailyAccumulator>();
  const itemTotalsMap = new Map<string, ItemAccumulator>();
  const loggedDateSet = new Set<string>();

  let totalQty = new Prisma.Decimal(0);
  let totalCost = new Prisma.Decimal(0);
  let totalEntries = 0;

  for (const entry of entries) {
    if (entry.deletedAt) continue;

    const item = itemMap.get(entry.menuItemId);
    const qty = toDecimal(entry.quantity);
    const unitCost = item ? toDecimal(item.unitCost) : new Prisma.Decimal(0);
    const cost = qty.mul(unitCost);
    const dateKey = toTimeZoneDateKey(entry.occurredAt, timeZone);
    const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();

    loggedDateSet.add(dateKey);
    totalQty = totalQty.add(qty);
    totalCost = totalCost.add(cost);
    totalEntries += 1;

    const dailyKey = `${entry.menuItemId}|${dateKey}`;
    const existingDaily = dailyMap.get(dailyKey);
    if (existingDaily) {
      existingDaily.qty = existingDaily.qty.add(qty);
      existingDaily.cost = existingDaily.cost.add(cost);
      existingDaily.entryCount += 1;
    } else {
      dailyMap.set(dailyKey, {
        menuItemId: entry.menuItemId,
        dateKey,
        weekday,
        qty,
        cost,
        entryCount: 1,
      });
    }

    const existingItem = itemTotalsMap.get(entry.menuItemId);
    if (existingItem) {
      existingItem.qty = existingItem.qty.add(qty);
      existingItem.cost = existingItem.cost.add(cost);
      existingItem.entryCount += 1;
      existingItem.dates.add(dateKey);
    } else {
      itemTotalsMap.set(entry.menuItemId, {
        menuItemId: entry.menuItemId,
        qty,
        cost,
        entryCount: 1,
        dates: new Set([dateKey]),
      });
    }
  }

  const dailyByItem: DailyItemWaste[] = Array.from(dailyMap.values())
    .sort((a, b) =>
      a.dateKey === b.dateKey
        ? a.menuItemId.localeCompare(b.menuItemId)
        : a.dateKey.localeCompare(b.dateKey),
    )
    .map((d) => ({
      menuItemId: d.menuItemId,
      dateKey: d.dateKey,
      weekday: d.weekday,
      quantity: d.qty.toDecimalPlaces(3).toString(),
      sarCost: d.cost.toDecimalPlaces(2).toString(),
      entryCount: d.entryCount,
    }));

  const totalsByItem: Record<string, ItemAggregateTotal> = {};
  for (const [menuItemId, agg] of itemTotalsMap.entries()) {
    totalsByItem[menuItemId] = {
      menuItemId,
      totalQuantity: agg.qty.toDecimalPlaces(3).toString(),
      totalSarCost: agg.cost.toDecimalPlaces(2).toString(),
      entryCount: agg.entryCount,
      daysLogged: agg.dates.size,
    };
  }

  return {
    dailyByItem,
    byReason: topReasons(entries, items),
    totalsByItem,
    totalQuantity: totalQty.toDecimalPlaces(3).toString(),
    totalSarCost: totalCost.toDecimalPlaces(2).toString(),
    totalEntries,
    loggedDateKeys: Array.from(loggedDateSet).sort(),
  };
}

function isDailyItemWasteArray(
  input: WasteByItemCostInput[] | DailyItemWaste[],
): input is DailyItemWaste[] {
  return input.length > 0 && "dateKey" in input[0]!;
}

export function classifyItems(
  wasteByItem: WasteByItemCostInput[] | DailyItemWaste[],
  options?: { asOfDate?: string; windowDays?: number },
): ClassifiedWasteItem[] {
  if (wasteByItem.length === 0) return [];

  const costByItem = new Map<string, Prisma.Decimal>();

  if (isDailyItemWasteArray(wasteByItem)) {
    const windowDays = options?.windowDays ?? 28;
    const latestDate =
      options?.asOfDate ??
      wasteByItem.reduce(
        (max, row) => (row.dateKey > max ? row.dateKey : max),
        wasteByItem[0]!.dateKey,
      );
    const startDate = shiftDateKey(latestDate, -(windowDays - 1));

    for (const row of wasteByItem) {
      if (row.dateKey < startDate || row.dateKey > latestDate) continue;
      const prev = costByItem.get(row.menuItemId) ?? new Prisma.Decimal(0);
      costByItem.set(row.menuItemId, prev.add(toDecimal(row.sarCost)));
    }
  } else {
    for (const row of wasteByItem) {
      const prev = costByItem.get(row.menuItemId) ?? new Prisma.Decimal(0);
      costByItem.set(row.menuItemId, prev.add(toDecimal(row.sarCost)));
    }
  }

  const sorted = Array.from(costByItem.entries()).sort((a, b) => {
    const cmp = b[1].comparedTo(a[1]);
    return cmp !== 0 ? cmp : a[0].localeCompare(b[0]);
  });

  const totalCost = sorted.reduce(
    (sum, [, cost]) => sum.add(cost),
    new Prisma.Decimal(0),
  );
  let cumulativeCost = new Prisma.Decimal(0);
  const fifty = new Prisma.Decimal(50);
  const eighty = new Prisma.Decimal(80);

  return sorted.map(([menuItemId, cost]) => {
    const priorShare = totalCost.gt(0) ? cumulativeCost.div(totalCost).mul(100) : new Prisma.Decimal(100);
    cumulativeCost = cumulativeCost.add(cost);
    const cumulativeShare = totalCost.gt(0) ? cumulativeCost.div(totalCost).mul(100) : new Prisma.Decimal(0);
    const itemShare = totalCost.gt(0) ? cost.div(totalCost).mul(100) : new Prisma.Decimal(0);

    let tier: CostTier = "LOW";
    if (totalCost.gt(0) && cost.gt(0)) {
      if (priorShare.lt(fifty)) tier = "HIGH";
      else if (priorShare.lt(eighty)) tier = "MEDIUM";
    }

    return {
      menuItemId,
      sarCost: cost.toDecimalPlaces(2).toString(),
      sharePct: itemShare.toDecimalPlaces(1).toString(),
      cumulativeSharePct: cumulativeShare.toDecimalPlaces(1).toString(),
      tier,
    };
  });
}

interface ReasonAccumulator {
  qty: Prisma.Decimal;
  cost: Prisma.Decimal;
  entryCount: number;
}

export function topReasons(
  entries: Array<
    Pick<InsightWasteEntry, "reason" | "quantity" | "deletedAt"> & {
      menuItemId?: string;
      sarCost?: DecimalInput;
    }
  >,
  items: InsightMenuItem[] = [],
): ReasonWasteSummary[] {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const reasonMap = new Map<WasteReason, ReasonAccumulator>();
  let totalCost = new Prisma.Decimal(0);

  for (const entry of entries) {
    if (entry.deletedAt) continue;
    const qty = toDecimal(entry.quantity);
    const item = entry.menuItemId ? itemMap.get(entry.menuItemId) : undefined;
    const cost =
      entry.sarCost !== undefined
        ? toDecimal(entry.sarCost)
        : qty.mul(item ? toDecimal(item.unitCost) : new Prisma.Decimal(0));

    totalCost = totalCost.add(cost);
    const current = reasonMap.get(entry.reason);
    if (current) {
      current.qty = current.qty.add(qty);
      current.cost = current.cost.add(cost);
      current.entryCount += 1;
    } else {
      reasonMap.set(entry.reason, { qty, cost, entryCount: 1 });
    }
  }

  return Array.from(reasonMap.entries())
    .sort((a, b) => {
      const cmp = b[1].cost.comparedTo(a[1].cost);
      return cmp !== 0 ? cmp : a[0].localeCompare(b[0]);
    })
    .map(([reason, data]) => ({
      reason,
      quantity: data.qty.toDecimalPlaces(3).toString(),
      sarCost: data.cost.toDecimalPlaces(2).toString(),
      entryCount: data.entryCount,
      sharePct: totalCost.gt(0)
        ? data.cost.div(totalCost).mul(100).toDecimalPlaces(1).toString()
        : "0.0",
    }));
}

export function dataGaps(
  entries: InsightWasteEntry[],
  expectedDays: Array<Date | string | InsightSalesRecord>,
  options?: { timeZone?: string; maxDateKey?: string },
): DataGapItem[] {
  const timeZone = options?.timeZone ?? RIYADH_TIME_ZONE;
  const wasteDateKeys = new Set<string>();

  for (const entry of entries) {
    if (entry.deletedAt) continue;
    wasteDateKeys.add(toTimeZoneDateKey(entry.occurredAt, timeZone));
  }

  const expectedDateKeys = new Set<string>();
  for (const item of expectedDays) {
    const rawDate =
      item instanceof Date || typeof item === "string" ? item : item.date;
    const key =
      typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())
        ? rawDate.trim()
        : rawDate instanceof Date
          ? rawDate.toISOString().slice(0, 10)
          : toTimeZoneDateKey(rawDate, timeZone);

    if (options?.maxDateKey && key > options.maxDateKey) continue;
    expectedDateKeys.add(key);
  }

  return Array.from(expectedDateKeys)
    .filter((key) => !wasteDateKeys.has(key))
    .sort()
    .map((dateKey) => ({ dateKey }));
}
