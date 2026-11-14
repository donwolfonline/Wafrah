import type { Prisma, PrismaClient } from "@prisma/client";
import { AuthorizationError, type SessionUser } from "@/lib/authz";
import { platformAdminDb } from "@/lib/db";
import {
  MODELS_WITH_MENU_ITEM_FK,
  PLATFORM_ONLY_MODELS,
  STRICT_TENANT_MODELS,
  stripTenantFields,
  TenantIsolationError,
  toDelegateName,
  verifyMenuItemOwnership,
  verifyTargetOwnership,
} from "@/lib/tenant-helpers";

export { platformAdminDb, TenantIsolationError };

export function createTenantDb(
  tenantId: string,
  baseClient: PrismaClient = platformAdminDb,
) {
  const normalizedTenantId = tenantId?.trim();
  if (!normalizedTenantId) {
    throw new TenantIsolationError(
      "A valid server-resolved tenantId is required for tenant queries",
    );
  }

  return baseClient.$extends({
    name: "wafrah-tenant-isolation",
    client: {
      getTenantId(): string {
        return normalizedTenantId;
      },
      queryTenantRaw<T = unknown>(
        buildSql: (scopedTenantId: string) => Prisma.Sql,
      ): Promise<T> {
        return baseClient.$queryRaw<T>(buildSql(normalizedTenantId));
      },
    },
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const mutableArgs = (args ?? {}) as Record<string, unknown>;

          if (PLATFORM_ONLY_MODELS.has(model)) {
            throw new TenantIsolationError(
              `Operation ${operation} on ${model} is restricted to PLATFORM_ADMIN`,
            );
          }

          if (model === "Restaurant") {
            if (
              operation === "create" ||
              operation === "createMany" ||
              operation === "delete" ||
              operation === "deleteMany"
            ) {
              throw new TenantIsolationError(
                `Operation ${operation} on Restaurant is forbidden for tenant-scoped clients`,
              );
            }
            const where = (mutableArgs.where ?? {}) as Record<string, unknown>;
            if (where.id !== undefined && where.id !== normalizedTenantId) {
              if (operation === "findUnique") return null;
              throw new TenantIsolationError(
                "Cannot access another Restaurant record",
              );
            }
            mutableArgs.where = { ...where, id: normalizedTenantId };
            return query(mutableArgs);
          }

          if (model === "EventCalendar") {
            if (
              operation === "findMany" ||
              operation === "findFirst" ||
              operation === "findFirstOrThrow" ||
              operation === "count" ||
              operation === "aggregate" ||
              operation === "groupBy"
            ) {
              const existingWhere = (mutableArgs.where ?? {}) as Record<
                string,
                unknown
              >;
              delete existingWhere.tenantId;
              mutableArgs.where = {
                AND: [
                  existingWhere,
                  {
                    OR: [{ tenantId: normalizedTenantId }, { tenantId: null }],
                  },
                ],
              };
              return query(mutableArgs);
            }

            if (
              operation === "findUnique" ||
              operation === "findUniqueOrThrow"
            ) {
              const res = (await query(mutableArgs)) as {
                tenantId?: string | null;
              } | null;
              if (
                res &&
                res.tenantId !== null &&
                res.tenantId !== normalizedTenantId
              ) {
                if (operation === "findUnique") return null;
                throw new TenantIsolationError(
                  "Cross-tenant EventCalendar read denied",
                );
              }
              return res;
            }
          }

          if (STRICT_TENANT_MODELS.has(model) || model === "EventCalendar") {
            if (
              operation === "findMany" ||
              operation === "findFirst" ||
              operation === "findFirstOrThrow" ||
              operation === "count" ||
              operation === "aggregate" ||
              operation === "groupBy"
            ) {
              const where = (mutableArgs.where ?? {}) as Record<
                string,
                unknown
              >;
              mutableArgs.where = { ...where, tenantId: normalizedTenantId };
              return query(mutableArgs);
            }

            if (
              operation === "findUnique" ||
              operation === "findUniqueOrThrow"
            ) {
              const res = (await query(mutableArgs)) as {
                tenantId?: string | null;
              } | null;
              if (res && res.tenantId !== normalizedTenantId) {
                if (operation === "findUnique") return null;
                throw new TenantIsolationError(
                  `Cross-tenant ${model} read denied`,
                );
              }
              return res;
            }

            if (operation === "create") {
              const rawData = (mutableArgs.data ?? {}) as Record<
                string,
                unknown
              >;
              if (MODELS_WITH_MENU_ITEM_FK.has(model)) {
                await verifyMenuItemOwnership(
                  baseClient,
                  normalizedTenantId,
                  rawData,
                );
              }
              mutableArgs.data = stripTenantFields(rawData, normalizedTenantId);
              return query(mutableArgs);
            }

            if (
              operation === "createMany" ||
              operation === "createManyAndReturn"
            ) {
              const rawData = mutableArgs.data;
              const items = Array.isArray(rawData)
                ? rawData
                : rawData
                  ? [rawData]
                  : [];
              for (const item of items) {
                if (MODELS_WITH_MENU_ITEM_FK.has(model)) {
                  await verifyMenuItemOwnership(
                    baseClient,
                    normalizedTenantId,
                    item as Record<string, unknown>,
                  );
                }
              }
              mutableArgs.data = items.map((item) =>
                stripTenantFields(
                  item as Record<string, unknown>,
                  normalizedTenantId,
                ),
              );
              return query(mutableArgs);
            }

            if (operation === "update" || operation === "delete") {
              await verifyTargetOwnership(
                baseClient,
                model,
                mutableArgs.where as Record<string, unknown> | undefined,
                normalizedTenantId,
              );
              if (operation === "update" && mutableArgs.data) {
                const rawData = mutableArgs.data as Record<string, unknown>;
                if (MODELS_WITH_MENU_ITEM_FK.has(model)) {
                  await verifyMenuItemOwnership(
                    baseClient,
                    normalizedTenantId,
                    rawData,
                  );
                }
                mutableArgs.data = stripTenantFields(
                  rawData,
                  normalizedTenantId,
                );
              }
              return query(mutableArgs);
            }

            if (operation === "upsert") {
              const where = (mutableArgs.where ?? {}) as Record<
                string,
                unknown
              >;
              const delegateName = toDelegateName(model);
              const delegate = (
                baseClient as unknown as Record<
                  string,
                  {
                    findUnique: (args: {
                      where: Record<string, unknown>;
                      select: { tenantId: true };
                    }) => Promise<{ tenantId: string | null } | null>;
                  }
                >
              )[delegateName];
              if (delegate) {
                const existing = await delegate.findUnique({
                  where,
                  select: { tenantId: true },
                });
                if (existing && existing.tenantId !== normalizedTenantId) {
                  throw new TenantIsolationError(
                    `Cross-tenant ${model} upsert denied`,
                  );
                }
              }
              mutableArgs.create = stripTenantFields(
                (mutableArgs.create ?? {}) as Record<string, unknown>,
                normalizedTenantId,
              );
              mutableArgs.update = stripTenantFields(
                (mutableArgs.update ?? {}) as Record<string, unknown>,
                normalizedTenantId,
              );
              return query(mutableArgs);
            }

            if (operation === "updateMany" || operation === "deleteMany") {
              const where = (mutableArgs.where ?? {}) as Record<
                string,
                unknown
              >;
              mutableArgs.where = { ...where, tenantId: normalizedTenantId };
              if (operation === "updateMany" && mutableArgs.data) {
                mutableArgs.data = stripTenantFields(
                  mutableArgs.data as Record<string, unknown>,
                  normalizedTenantId,
                );
              }
              return query(mutableArgs);
            }
          }

          return query(mutableArgs);
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof createTenantDb>;

export async function getTenantDb(
  sessionUserOverride?: SessionUser | null,
): Promise<TenantPrismaClient> {
  let user = sessionUserOverride;
  if (user === undefined) {
    const { getServerSessionUser } = await import("@/features/auth/session");
    user = await getServerSessionUser();
  }

  if (!user || !user.userId) {
    throw new AuthorizationError("Unauthenticated", 401);
  }

  if (!user.tenantId) {
    throw new TenantIsolationError(
      "Authenticated user does not belong to a restaurant tenant",
    );
  }

  return createTenantDb(user.tenantId);
}

export async function getPlatformAdminDb(
  sessionUserOverride?: SessionUser | null,
): Promise<PrismaClient> {
  let user = sessionUserOverride;
  if (user === undefined) {
    const { getServerSessionUser } = await import("@/features/auth/session");
    user = await getServerSessionUser();
  }

  if (!user || !user.userId) {
    throw new AuthorizationError("Unauthenticated", 401);
  }

  if (user.role !== "PLATFORM_ADMIN") {
    throw new AuthorizationError(
      "platformAdminDb is restricted to PLATFORM_ADMIN",
      403,
    );
  }

  return platformAdminDb;
}
