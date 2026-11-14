import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/authz";
import { getPlatformAdminDb } from "@/lib/tenant";
import {
  AdminServiceError,
  parseRenewDateInput,
  restaurantIdSchema,
  suspendRestaurantSchema,
  updateSubscriptionSchema,
} from "./schemas";

export async function updateAdminSubscription(
  actor: SessionUser | null | undefined,
  rawRestaurantId: string,
  rawInput: unknown,
) {
  const platformAdminDb = await getPlatformAdminDb(actor);
  const parsedId = restaurantIdSchema.safeParse(rawRestaurantId);
  if (!parsedId.success) {
    throw new AdminServiceError("Invalid restaurant ID", 400);
  }
  const restaurantId = parsedId.data;

  const parsed = updateSubscriptionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AdminServiceError(
      parsed.error.issues[0]?.message ?? "Invalid subscription payload",
      400,
    );
  }

  const existing = await platformAdminDb.restaurant.findUnique({
    where: { id: restaurantId },
    include: { subscription: true },
  });
  if (!existing) {
    throw new AdminServiceError("Restaurant not found", 404);
  }

  const nextRenewsAt =
    parsed.data.renewsAt === undefined
      ? (existing.subscription?.renewsAt ?? null)
      : parseRenewDateInput(parsed.data.renewsAt);

  const updated = await platformAdminDb.$transaction(async (tx) => {
    const subscription = await tx.subscription.upsert({
      where: { tenantId: restaurantId },
      create: {
        tenantId: restaurantId,
        plan: parsed.data.plan,
        status: parsed.data.status,
        renewsAt: nextRenewsAt,
      },
      update: {
        plan: parsed.data.plan,
        status: parsed.data.status,
        renewsAt: nextRenewsAt,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: restaurantId,
        userId: actor?.userId ?? null,
        action: "ADMIN_SUBSCRIPTION_UPDATED",
        entity: "Subscription",
        entityId: subscription.id,
        metadata: {
          code: existing.code,
          before: existing.subscription
            ? {
                plan: existing.subscription.plan,
                status: existing.subscription.status,
                renewsAt: existing.subscription.renewsAt?.toISOString() ?? null,
              }
            : null,
          after: {
            plan: subscription.plan,
            status: subscription.status,
            renewsAt: subscription.renewsAt?.toISOString() ?? null,
          },
        } satisfies Prisma.InputJsonObject,
      },
    });

    return subscription;
  });

  return {
    id: updated.id,
    tenantId: restaurantId,
    plan: updated.plan,
    status: updated.status,
    renewsAt: updated.renewsAt?.toISOString() ?? null,
  };
}

export async function setRestaurantSuspension(
  actor: SessionUser | null | undefined,
  rawRestaurantId: string,
  rawInput: unknown,
) {
  const platformAdminDb = await getPlatformAdminDb(actor);
  const parsedId = restaurantIdSchema.safeParse(rawRestaurantId);
  if (!parsedId.success) {
    throw new AdminServiceError("Invalid restaurant ID", 400);
  }
  const restaurantId = parsedId.data;

  const parsed = suspendRestaurantSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AdminServiceError(
      parsed.error.issues[0]?.message ?? "Invalid suspension payload",
      400,
    );
  }

  const existing = await platformAdminDb.restaurant.findUnique({
    where: { id: restaurantId },
    include: { subscription: true },
  });
  if (!existing) {
    throw new AdminServiceError("Restaurant not found", 404);
  }

  const nextStatus =
    parsed.data.action === "suspend" ? "SUSPENDED" : "ACTIVE";
  const auditAction =
    parsed.data.action === "suspend"
      ? "ADMIN_RESTAURANT_SUSPENDED"
      : "ADMIN_RESTAURANT_REACTIVATED";

  const updated = await platformAdminDb.$transaction(async (tx) => {
    const subscription = await tx.subscription.upsert({
      where: { tenantId: restaurantId },
      create: {
        tenantId: restaurantId,
        plan: "SMALL",
        status: nextStatus,
        renewsAt: null,
      },
      update: {
        status: nextStatus,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: restaurantId,
        userId: actor?.userId ?? null,
        action: auditAction,
        entity: "Restaurant",
        entityId: restaurantId,
        metadata: {
          code: existing.code,
          previousStatus: existing.subscription?.status ?? null,
          nextStatus,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return subscription;
  });

  return {
    tenantId: restaurantId,
    plan: updated.plan,
    status: updated.status,
    renewsAt: updated.renewsAt?.toISOString() ?? null,
  };
}
