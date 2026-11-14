import type { Prisma, PrismaClient } from "@prisma/client";
import { sendWelcomeEmailForUser } from "@/features/notifications";
import type { SessionUser } from "@/lib/authz";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { hashSecret } from "@/lib/password";
import { getPlatformAdminDb } from "@/lib/tenant";
import {
  buildRestaurantCodeCandidate,
  deriveManagerUsername,
  generateTemporaryPassword,
} from "./credentials";
import { AdminServiceError, createRestaurantSchema } from "./schemas";
import type { CreateRestaurantResult } from "./types";

export interface CreateRestaurantOptions {
  now?: Date;
  sendWelcomeFn?: typeof sendWelcomeEmailForUser;
  appUrl?: string;
}

async function allocateUniqueRestaurantCode(
  platformAdminDb: PrismaClient,
  name: string,
  city: string,
): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = buildRestaurantCodeCandidate(name, city, attempt);
    const existing = await platformAdminDb.restaurant.findUnique({
      where: { code: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }
  return buildRestaurantCodeCandidate(name, city, 100);
}

export async function createAdminRestaurant(
  actor: SessionUser | null | undefined,
  rawInput: unknown,
  options?: CreateRestaurantOptions,
): Promise<CreateRestaurantResult> {
  const platformAdminDb = await getPlatformAdminDb(actor);

  const parsed = createRestaurantSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AdminServiceError(
      parsed.error.issues[0]?.message ?? "Invalid restaurant payload",
      400,
    );
  }

  const input = parsed.data;
  const existingEmailUser = await platformAdminDb.user.findUnique({
    where: { email: input.managerEmail },
    select: { id: true },
  });
  if (existingEmailUser) {
    throw new AdminServiceError(
      "A user with this manager email already exists",
      409,
    );
  }

  const now = options?.now ?? new Date();
  const code = await allocateUniqueRestaurantCode(
    platformAdminDb,
    input.name,
    input.city,
  );
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = hashSecret(temporaryPassword);
  const managerUsername = deriveManagerUsername(input.managerEmail);
  const defaultRenewsAt = new Date(now.getTime() + 30 * 86_400_000);

  const created = await platformAdminDb.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.create({
      data: {
        code,
        name: input.name,
        nameAr: input.nameAr,
        city: input.city,
        type: input.type,
        timezone: RIYADH_TIME_ZONE,
      },
    });

    const subscription = await tx.subscription.create({
      data: {
        tenantId: restaurant.id,
        plan: input.plan,
        status: "ACTIVE",
        renewsAt: defaultRenewsAt,
      },
    });

    const manager = await tx.user.create({
      data: {
        tenantId: restaurant.id,
        name: input.managerName,
        email: input.managerEmail,
        username: managerUsername,
        role: "MANAGER",
        passwordHash,
        locale: input.managerLocale,
        active: true,
      },
    });

    await tx.notificationPreference.create({
      data: {
        tenantId: restaurant.id,
        userId: manager.id,
        criticalAlerts: true,
        weeklySummary: true,
        monthlyReport: true,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: restaurant.id,
        userId: actor?.userId ?? null,
        action: "ADMIN_RESTAURANT_CREATED",
        entity: "Restaurant",
        entityId: restaurant.id,
        metadata: {
          code: restaurant.code,
          name: restaurant.name,
          nameAr: restaurant.nameAr,
          city: restaurant.city,
          type: restaurant.type,
          plan: subscription.plan,
          status: subscription.status,
          renewsAt: subscription.renewsAt?.toISOString() ?? null,
          managerUserId: manager.id,
          managerEmail: input.managerEmail,
          managerLocale: manager.locale,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return { restaurant, subscription, manager };
  });

  let welcomeEmailStatus: "sent" | "failed" = "sent";
  const sendWelcomeFn = options?.sendWelcomeFn ?? sendWelcomeEmailForUser;
  try {
    const emailResult = await sendWelcomeFn({
      email: input.managerEmail,
      name: created.manager.name,
      locale: created.manager.locale === "en" ? "en" : "ar",
      restaurantName: created.restaurant.name,
      restaurantNameAr: created.restaurant.nameAr,
      branchCode: created.restaurant.code,
      role: created.manager.role,
      appUrl: options?.appUrl,
    });
    if (!emailResult.ok) {
      welcomeEmailStatus = "failed";
    }
  } catch {
    welcomeEmailStatus = "failed";
  }

  return {
    customer: {
      id: created.restaurant.id,
      code: created.restaurant.code,
      name: created.restaurant.name,
      nameAr: created.restaurant.nameAr,
      city: created.restaurant.city,
      type: created.restaurant.type,
      plan: created.subscription.plan,
      status: created.subscription.status,
      renewsAt: created.subscription.renewsAt?.toISOString() ?? null,
      userCount: 1,
      lastActivityAt: null,
      entriesLast7Days: 0,
      createdAt: created.restaurant.createdAt.toISOString(),
    },
    manager: {
      id: created.manager.id,
      name: created.manager.name,
      email: created.manager.email ?? input.managerEmail,
      username: created.manager.username ?? managerUsername,
      locale: created.manager.locale === "en" ? "en" : "ar",
      role: created.manager.role,
    },
    temporaryPassword,
    welcomeEmailStatus,
  };
}
