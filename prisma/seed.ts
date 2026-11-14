import { platformAdminDb as prisma } from "../src/lib/db";
import { hashSecret } from "../src/lib/password";
import {
  GLOBAL_EVENT_CALENDAR,
  JEDDAH_MENU_ITEMS,
  MAKKAH_MENU_ITEMS,
  SEED_CREDENTIALS,
  type SeedMenuItemSpec,
} from "./seed-data";
import { createPrng, seedRestaurantTimeSeries } from "./seed-timeseries";

function assertNonProductionSeedEnv(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run destructive demo seed in production. Use pnpm db:seed:prod instead.",
    );
  }
}

export async function runSeed() {
  assertNonProductionSeedEnv();
  const prng = createPrng(20261112);
  const totalDays = 120;
  const todayUtc = new Date("2026-11-12T00:00:00.000Z");
  const startDateUtc = new Date(
    todayUtc.getTime() - (totalDays - 1) * 86_400_000,
  );
  const baselineEndUtc = new Date(startDateUtc.getTime() + 13 * 86_400_000);

  await prisma.auditLog.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.forecastResult.deleteMany();
  await prisma.wasteEntry.deleteMany();
  await prisma.salesRecord.deleteMany();
  await prisma.purchaseRecord.deleteMany();
  await prisma.eventCalendar.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.restaurant.deleteMany();

  // 1) Platform Admin
  const platformAdmin = await prisma.user.create({
    data: {
      tenantId: null,
      name: "Wafrah Platform Admin",
      role: "PLATFORM_ADMIN",
      email: SEED_CREDENTIALS.platformAdmin.email,
      username: SEED_CREDENTIALS.platformAdmin.username,
      passwordHash: hashSecret(SEED_CREDENTIALS.platformAdmin.password),
      locale: "ar",
      active: true,
    },
  });

  // 2) Demo Restaurant 1: Al Bait Al Shami (Jeddah)
  const jeddahRestaurant = await prisma.restaurant.create({
    data: {
      code: SEED_CREDENTIALS.jeddahRestaurant.code,
      name: SEED_CREDENTIALS.jeddahRestaurant.name,
      nameAr: SEED_CREDENTIALS.jeddahRestaurant.nameAr,
      city: "Jeddah",
      type: "Casual Dining / Levantine & Saudi Grill",
      timezone: "Asia/Riyadh",
      baselineStart: startDateUtc,
      baselineEnd: baselineEndUtc,
    },
  });

  await prisma.subscription.create({
    data: {
      tenantId: jeddahRestaurant.id,
      plan: "MEDIUM",
      status: "ACTIVE",
      renewsAt: new Date("2027-11-12T00:00:00.000Z"),
    },
  });

  const jeddahOwner = await prisma.user.create({
    data: {
      tenantId: jeddahRestaurant.id,
      name: "Tariq Al-Shami",
      role: "OWNER",
      email: SEED_CREDENTIALS.jeddahRestaurant.owner.email,
      username: SEED_CREDENTIALS.jeddahRestaurant.owner.username,
      passwordHash: hashSecret(
        SEED_CREDENTIALS.jeddahRestaurant.owner.password,
      ),
      locale: "ar",
      active: true,
    },
  });

  const jeddahStaffIds: string[] = [];
  for (const staffSpec of SEED_CREDENTIALS.jeddahRestaurant.staff) {
    const staffUser = await prisma.user.create({
      data: {
        tenantId: jeddahRestaurant.id,
        name: staffSpec.name,
        role: "STAFF",
        username: staffSpec.username,
        pinHash: hashSecret(staffSpec.pin),
        locale: "ar",
        active: true,
      },
    });
    jeddahStaffIds.push(staffUser.id);
  }

  const jeddahItems: Array<{ id: string; spec: SeedMenuItemSpec }> = [];
  for (const spec of JEDDAH_MENU_ITEMS) {
    const item = await prisma.menuItem.create({
      data: {
        tenantId: jeddahRestaurant.id,
        code: spec.code,
        name: spec.name,
        nameAr: spec.nameAr,
        category: spec.category,
        unit: spec.unit,
        salesUnitFactor: spec.salesUnitFactor,
        unitCost: spec.unitCost,
        shortageCost: spec.shortageCost,
        active: true,
      },
    });
    jeddahItems.push({ id: item.id, spec });
  }

  // 3) Restaurant 2: Diwan Al Hijaz (Makkah) for tenant isolation verification
  const makkahRestaurant = await prisma.restaurant.create({
    data: {
      code: SEED_CREDENTIALS.makkahRestaurant.code,
      name: SEED_CREDENTIALS.makkahRestaurant.name,
      nameAr: SEED_CREDENTIALS.makkahRestaurant.nameAr,
      city: "Makkah",
      type: "Traditional Hijazi Hospitality",
      timezone: "Asia/Riyadh",
      baselineStart: startDateUtc,
      baselineEnd: baselineEndUtc,
    },
  });

  await prisma.subscription.create({
    data: {
      tenantId: makkahRestaurant.id,
      plan: "SMALL",
      status: "TRIAL",
      renewsAt: new Date("2026-12-31T00:00:00.000Z"),
    },
  });

  await prisma.user.create({
    data: {
      tenantId: makkahRestaurant.id,
      name: "Faisal Al-Makki",
      role: "OWNER",
      email: SEED_CREDENTIALS.makkahRestaurant.owner.email,
      username: SEED_CREDENTIALS.makkahRestaurant.owner.username,
      passwordHash: hashSecret(
        SEED_CREDENTIALS.makkahRestaurant.owner.password,
      ),
      locale: "ar",
      active: true,
    },
  });

  const makkahStaffIds: string[] = [];
  for (const staffSpec of SEED_CREDENTIALS.makkahRestaurant.staff) {
    const staffUser = await prisma.user.create({
      data: {
        tenantId: makkahRestaurant.id,
        name: staffSpec.name,
        role: "STAFF",
        username: staffSpec.username,
        pinHash: hashSecret(staffSpec.pin),
        locale: "ar",
        active: true,
      },
    });
    makkahStaffIds.push(staffUser.id);
  }

  const makkahItems: Array<{ id: string; spec: SeedMenuItemSpec }> = [];
  for (const spec of MAKKAH_MENU_ITEMS) {
    const item = await prisma.menuItem.create({
      data: {
        tenantId: makkahRestaurant.id,
        code: spec.code,
        name: spec.name,
        nameAr: spec.nameAr,
        category: spec.category,
        unit: spec.unit,
        salesUnitFactor: spec.salesUnitFactor,
        unitCost: spec.unitCost,
        shortageCost: spec.shortageCost,
        active: true,
      },
    });
    makkahItems.push({ id: item.id, spec });
  }

  // 4 & 5) 120 days of SalesRecord, PurchaseRecord, and WasteEntry
  await seedRestaurantTimeSeries({
    prisma,
    tenantId: jeddahRestaurant.id,
    tenantCode: jeddahRestaurant.code,
    staffIds: jeddahStaffIds,
    items: jeddahItems,
    startDateUtc,
    totalDays,
    prng,
  });

  await seedRestaurantTimeSeries({
    prisma,
    tenantId: makkahRestaurant.id,
    tenantCode: makkahRestaurant.code,
    staffIds: makkahStaffIds,
    items: makkahItems,
    startDateUtc,
    totalDays,
    prng,
  });

  // 6) Global EventCalendar entries
  await prisma.eventCalendar.createMany({
    data: GLOBAL_EVENT_CALENDAR.map((ev) => ({
      tenantId: null,
      name: ev.name,
      nameAr: ev.nameAr,
      startDate: ev.startDate,
      endDate: ev.endDate,
      demandMultiplier: ev.demandMultiplier,
    })),
  });

  await prisma.auditLog.create({
    data: {
      tenantId: jeddahRestaurant.id,
      userId: platformAdmin.id,
      action: "TENANT_SEEDED",
      entity: "Restaurant",
      entityId: jeddahRestaurant.id,
      metadata: { seededBy: platformAdmin.email, ownerId: jeddahOwner.id },
    },
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("\n=== Wafrah Dev Seed Credentials ===");
    console.log(
      `Platform Admin: ${SEED_CREDENTIALS.platformAdmin.email} / ${SEED_CREDENTIALS.platformAdmin.password}`,
    );
    console.log(
      `Jeddah (${SEED_CREDENTIALS.jeddahRestaurant.code}) Owner/Manager: ${SEED_CREDENTIALS.jeddahRestaurant.owner.email} / ${SEED_CREDENTIALS.jeddahRestaurant.owner.password}`,
    );
    for (const s of SEED_CREDENTIALS.jeddahRestaurant.staff) {
      console.log(
        `Jeddah (${SEED_CREDENTIALS.jeddahRestaurant.code}) Staff: username="${s.username}" PIN="${s.pin}"`,
      );
    }
    console.log(
      `Makkah (${SEED_CREDENTIALS.makkahRestaurant.code}) Owner/Manager: ${SEED_CREDENTIALS.makkahRestaurant.owner.email} / ${SEED_CREDENTIALS.makkahRestaurant.owner.password}`,
    );
    for (const s of SEED_CREDENTIALS.makkahRestaurant.staff) {
      console.log(
        `Makkah (${SEED_CREDENTIALS.makkahRestaurant.code}) Staff: username="${s.username}" PIN="${s.pin}"`,
      );
    }
    console.log("===================================\n");
  }

  const [
    restaurantCount,
    userCount,
    menuItemCount,
    wasteEntryCount,
    salesRecordCount,
    purchaseRecordCount,
    eventCalendarCount,
    forecastResultCount,
    alertCount,
    subscriptionCount,
    auditLogCount,
  ] = await Promise.all([
    prisma.restaurant.count(),
    prisma.user.count(),
    prisma.menuItem.count(),
    prisma.wasteEntry.count(),
    prisma.salesRecord.count(),
    prisma.purchaseRecord.count(),
    prisma.eventCalendar.count(),
    prisma.forecastResult.count(),
    prisma.alert.count(),
    prisma.subscription.count(),
    prisma.auditLog.count(),
  ]);

  console.table({
    Restaurant: restaurantCount,
    User: userCount,
    MenuItem: menuItemCount,
    WasteEntry: wasteEntryCount,
    SalesRecord: salesRecordCount,
    PurchaseRecord: purchaseRecordCount,
    EventCalendar: eventCalendarCount,
    ForecastResult: forecastResultCount,
    Alert: alertCount,
    Subscription: subscriptionCount,
    AuditLog: auditLogCount,
  });
}

runSeed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
