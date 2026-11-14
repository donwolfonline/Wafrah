import type { Prisma, PrismaClient, SalesChannel } from "@prisma/client";
import { SHIFTS, WASTE_REASONS, type SeedMenuItemSpec } from "./seed-data";

export function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getWeekdayMultiplier(utcDay: number): number {
  if (utcDay === 4) return 1.35; // Thursday
  if (utcDay === 5) return 1.45; // Friday
  if (utcDay === 6) return 1.15; // Saturday
  return 0.95; // Sunday - Wednesday
}

function formatQty(value: number, unit: SeedMenuItemSpec["unit"]): string {
  if (unit === "PORTION" || unit === "PIECE") {
    return Math.max(1, Math.round(value)).toFixed(3);
  }
  return Math.max(0.25, Math.round(value * 4) / 4).toFixed(3);
}

export async function seedRestaurantTimeSeries(params: {
  prisma: PrismaClient;
  tenantId: string;
  tenantCode: string;
  staffIds: string[];
  items: Array<{ id: string; spec: SeedMenuItemSpec }>;
  startDateUtc: Date;
  totalDays: number;
  prng: () => number;
}) {
  const {
    prisma,
    tenantId,
    tenantCode,
    staffIds,
    items,
    startDateUtc,
    totalDays,
    prng,
  } = params;
  const salesRows: Prisma.SalesRecordCreateManyInput[] = [];
  const purchaseRows: Prisma.PurchaseRecordCreateManyInput[] = [];
  const wasteRows: Prisma.WasteEntryCreateManyInput[] = [];
  const channels: SalesChannel[] = ["DINE_IN", "DELIVERY", "TAKEAWAY"];

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const date = new Date(startDateUtc.getTime() + dayOffset * 86_400_000);
    const weekday = date.getUTCDay();
    const weekdayFactor = getWeekdayMultiplier(weekday);
    const isRamadanStyleUplift = dayOffset >= 30 && dayOffset < 60;
    const upliftFactor = isRamadanStyleUplift ? 1.28 : 1.0;
    const isLast7Days = dayOffset >= totalDays - 7;

    for (const { id: menuItemId, spec } of items) {
      const salesNoise = 0.9 + prng() * 0.2;
      const totalSold =
        spec.baseDailySold * weekdayFactor * upliftFactor * salesNoise;
      const primaryChannel = channels[dayOffset % channels.length]!;

      salesRows.push({
        tenantId,
        menuItemId,
        date,
        quantitySold: formatQty(totalSold, "PORTION"),
        channel: primaryChannel,
        source: "CSV",
      });

      const canonicalSold = totalSold * Number(spec.salesUnitFactor);
      const purchaseQty = canonicalSold * (1.12 + prng() * 0.08);
      const unitCostNum = Number(spec.unitCost);
      purchaseRows.push({
        tenantId,
        menuItemId,
        date,
        quantity: formatQty(purchaseQty, spec.unit),
        cost: (purchaseQty * unitCostNum).toFixed(2),
      });

      const wasteNoise = 0.88 + prng() * 0.24;
      const anomalyFactor = spec.isAnomalyTarget && isLast7Days ? 1.42 : 1.0;
      const wasteQty =
        spec.baseDailyWaste *
        weekdayFactor *
        (isRamadanStyleUplift ? 1.15 : 1.0) *
        wasteNoise *
        anomalyFactor;

      const reasonIndex = Math.floor(prng() * WASTE_REASONS.length);
      const shiftIndex = Math.floor(prng() * SHIFTS.length);
      const staffId = staffIds[dayOffset % staffIds.length]!;
      const occurredAt = new Date(
        date.getTime() + (10 + shiftIndex * 5) * 3_600_000,
      );

      wasteRows.push({
        tenantId,
        menuItemId,
        quantity: formatQty(wasteQty, spec.unit),
        reason:
          spec.isAnomalyTarget && isLast7Days
            ? "OVER_PREPARATION"
            : WASTE_REASONS[reasonIndex]!,
        shift: SHIFTS[shiftIndex]!,
        occurredAt,
        loggedById: staffId,
        clientId: `${tenantCode}-${spec.code}-day-${dayOffset}`,
        note:
          spec.isAnomalyTarget && isLast7Days
            ? "Excess mandi rice batch after evening service"
            : null,
      });
    }
  }

  await prisma.salesRecord.createMany({ data: salesRows });
  await prisma.purchaseRecord.createMany({ data: purchaseRows });
  await prisma.wasteEntry.createMany({ data: wasteRows });
}
