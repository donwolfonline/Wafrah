import { PrismaClient } from "@prisma/client";

export function resolveDatabaseUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.username) {
      parsed.username = process.env.USER || process.env.LOGNAME || "postgres";
      return parsed.toString();
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

const globalForPrisma = globalThis as unknown as {
  platformAdminDbV3: PrismaClient | undefined;
};

const resolvedUrl = resolveDatabaseUrl(process.env.DATABASE_URL);

const cachedClient = globalForPrisma.platformAdminDbV3;
const isCachedClientCurrent =
  cachedClient !== undefined &&
  "importColumnMapping" in cachedClient &&
  "importBatch" in cachedClient &&
  "notificationPreference" in cachedClient &&
  "feedback" in cachedClient;

/**
 * Unscoped Prisma client reserved strictly for PLATFORM_ADMIN paths,
 * authentication bootstrap, audit logging, and seed scripts.
 * All tenant-facing queries MUST use `getTenantDb()` or `createTenantDb(tenantId)` from `@/lib/tenant`.
 */
export const platformAdminDb = isCachedClientCurrent
  ? cachedClient
  : new PrismaClient({
      ...(resolvedUrl ? { datasources: { db: { url: resolvedUrl } } } : {}),
      log:
        process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.platformAdminDbV3 = platformAdminDb;
}
