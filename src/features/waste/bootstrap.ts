import { Prisma } from "@prisma/client";
import { requireRole, type SessionUser } from "@/lib/authz";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { getTenantDb, type TenantPrismaClient } from "@/lib/tenant";
import {
  DEFAULT_MAX_QUANTITY_BY_UNIT,
  type WasteLogBootstrapDto,
} from "./schemas";
import { detectShift, getRiyadhDayBoundsUtc, parseShiftConfig } from "./shift";

export async function calculateTodayWasteSarForTenant(
  db: TenantPrismaClient,
  referenceDate: Date = new Date(),
  timeZone: string = RIYADH_TIME_ZONE,
): Promise<string> {
  const { startUtc, endUtc } = getRiyadhDayBoundsUtc(referenceDate, timeZone);
  const entries = await db.wasteEntry.findMany({
    where: {
      deletedAt: null,
      occurredAt: {
        gte: startUtc,
        lt: endUtc,
      },
    },
    select: {
      quantity: true,
      menuItem: {
        select: {
          unitCost: true,
        },
      },
    },
  });

  let total = new Prisma.Decimal(0);
  for (const entry of entries) {
    total = total.add(entry.quantity.mul(entry.menuItem.unitCost));
  }

  return total.toFixed(2);
}

export async function getWasteLogBootstrapForUser(
  sessionUser?: SessionUser | null,
  now: Date = new Date(),
): Promise<WasteLogBootstrapDto> {
  const user = await requireRole("waste.create", sessionUser);
  const db = await getTenantDb(user);

  const [restaurant, activeItems, userGrouped, tenantGrouped] =
    await Promise.all([
      db.restaurant.findFirstOrThrow({
        select: {
          name: true,
          nameAr: true,
          timezone: true,
          shiftConfig: true,
        },
      }),
      db.menuItem.findMany({
        where: { active: true },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      db.wasteEntry.groupBy({
        by: ["menuItemId"],
        where: {
          loggedById: user.userId,
          deletedAt: null,
        },
        _count: {
          menuItemId: true,
        },
        _max: {
          occurredAt: true,
        },
        orderBy: [
          { _count: { menuItemId: "desc" } },
          { _max: { occurredAt: "desc" } },
        ],
      }),
      db.wasteEntry.groupBy({
        by: ["menuItemId"],
        where: {
          deletedAt: null,
        },
        _count: {
          menuItemId: true,
        },
        orderBy: {
          _count: { menuItemId: "desc" },
        },
        take: 12,
      }),
    ]);

  const timeZone = restaurant.timezone || RIYADH_TIME_ZONE;
  const shiftConfig = parseShiftConfig(restaurant.shiftConfig);
  const currentShift = detectShift(now, shiftConfig, timeZone);
  const todayWasteSar = await calculateTodayWasteSarForTenant(
    db,
    now,
    timeZone,
  );

  const activeItemIds = new Set(activeItems.map((i) => i.id));
  const userItemCounts: Record<string, number> = {};

  for (const row of userGrouped) {
    if (activeItemIds.has(row.menuItemId)) {
      userItemCounts[row.menuItemId] = row._count.menuItemId;
    }
  }

  const recentItemIds: string[] = [];
  for (const row of userGrouped) {
    if (activeItemIds.has(row.menuItemId) && recentItemIds.length < 6) {
      recentItemIds.push(row.menuItemId);
    }
  }

  if (recentItemIds.length < 6) {
    for (const row of tenantGrouped) {
      if (
        activeItemIds.has(row.menuItemId) &&
        !recentItemIds.includes(row.menuItemId) &&
        recentItemIds.length < 6
      ) {
        recentItemIds.push(row.menuItemId);
      }
    }
  }

  return {
    restaurantName: restaurant.name,
    restaurantNameAr: restaurant.nameAr,
    shiftConfig,
    currentShift,
    todayWasteSar,
    items: activeItems.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      nameAr: item.nameAr,
      category: item.category,
      unit: item.unit,
      unitCost: item.unitCost.toString(),
    })),
    recentItemIds,
    userItemCounts,
    maxQuantityByUnit: { ...DEFAULT_MAX_QUANTITY_BY_UNIT },
  };
}
