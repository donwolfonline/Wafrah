import type { PrismaClient } from "@prisma/client";
import { env } from "@/env";
import {
  createPlatformPrismaClient,
  resolveDatabaseUrl,
} from "./db-factory";

export { resolveDatabaseUrl };

const globalForPrisma = globalThis as unknown as {
  platformAdminDbV3: PrismaClient | undefined;
};

const cachedClient = globalForPrisma.platformAdminDbV3;
const isCachedClientCurrent =
  cachedClient !== undefined &&
  "importColumnMapping" in cachedClient &&
  "importBatch" in cachedClient &&
  "notificationPreference" in cachedClient &&
  "feedback" in cachedClient &&
  "lead" in cachedClient &&
  "rateLimitBucket" in cachedClient;

/**
 * Unscoped Prisma client reserved strictly for PLATFORM_ADMIN paths,
 * authentication bootstrap, audit logging, and seed scripts.
 * All tenant-facing queries MUST use `getTenantDb()` or `createTenantDb(tenantId)` from `@/lib/tenant`.
 */
export const platformAdminDb = isCachedClientCurrent
  ? cachedClient
  : createPlatformPrismaClient({
      databaseUrl: env.DATABASE_URL,
      fallbackUsername: env.USER ?? env.LOGNAME,
      nodeEnv: env.NODE_ENV,
    });

// Reuse a single pooled PrismaClient instance per runtime worker/container
// across both local HMR reloads and warm serverless function invocations.
globalForPrisma.platformAdminDbV3 = platformAdminDb;
