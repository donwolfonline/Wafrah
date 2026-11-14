import { platformAdminDb } from "@/lib/tenant";

export interface FixedWindowConsumeResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export interface LockoutBucketState {
  failures: number;
  lockedUntilMs: number | null;
}

/**
 * Atomically increments a fixed-window request counter in Postgres (`RateLimitBucket`).
 * Safe across concurrent serverless function invocations.
 */
export async function consumeFixedWindowBucket(params: {
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
}): Promise<FixedWindowConsumeResult> {
  const nowMs = params.nowMs ?? Date.now();
  const nowDate = new Date(nowMs);
  const expiresDate = new Date(nowMs + params.windowMs);
  const windowCutoffDate = new Date(nowMs - params.windowMs);

  const rows = await platformAdminDb.$queryRaw<
    Array<{ count: number; windowStart: Date; expiresAt: Date }>
  >`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "expiresAt", "updatedAt")
    VALUES (${params.key}, 1, ${nowDate}, ${expiresDate}, ${nowDate})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."windowStart" <= ${windowCutoffDate}
          OR "RateLimitBucket"."expiresAt" <= ${nowDate}
        THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimitBucket"."windowStart" <= ${windowCutoffDate}
          OR "RateLimitBucket"."expiresAt" <= ${nowDate}
        THEN ${nowDate}
        ELSE "RateLimitBucket"."windowStart"
      END,
      "expiresAt" = CASE
        WHEN "RateLimitBucket"."windowStart" <= ${windowCutoffDate}
          OR "RateLimitBucket"."expiresAt" <= ${nowDate}
        THEN ${expiresDate}
        ELSE "RateLimitBucket"."expiresAt"
      END,
      "updatedAt" = ${nowDate}
    RETURNING "count", "windowStart", "expiresAt"
  `;

  const row = rows[0];
  if (!row) {
    return {
      allowed: true,
      limit: params.limit,
      remaining: Math.max(0, params.limit - 1),
      retryAfterSeconds: 0,
    };
  }

  if (row.count > params.limit) {
    const resetAtMs = row.windowStart.getTime() + params.windowMs;
    const retryAfterMs = Math.max(1000, resetAtMs - nowMs);
    return {
      allowed: false,
      limit: params.limit,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  return {
    allowed: true,
    limit: params.limit,
    remaining: Math.max(0, params.limit - row.count),
    retryAfterSeconds: 0,
  };
}

/**
 * Fetches current lockout bucket states from Postgres without mutating counters.
 */
export async function getLockoutBucketStates(params: {
  keys: string[];
  maxAttempts: number;
  nowMs: number;
}): Promise<Map<string, LockoutBucketState>> {
  const rows = await platformAdminDb.rateLimitBucket.findMany({
    where: { key: { in: params.keys } },
    select: { key: true, count: true, expiresAt: true },
  });

  const out = new Map<string, LockoutBucketState>();
  for (const row of rows) {
    if (row.expiresAt.getTime() <= params.nowMs) {
      out.set(row.key, { failures: 0, lockedUntilMs: null });
      continue;
    }

    const lockedUntilMs =
      row.count >= params.maxAttempts ? row.expiresAt.getTime() : null;
    out.set(row.key, {
      failures: row.count,
      lockedUntilMs,
    });
  }

  return out;
}

/**
 * Atomically increments a failure counter and locks the bucket in Postgres
 * once `maxAttempts` consecutive failures occur.
 */
export async function recordLockoutFailureBucket(params: {
  key: string;
  maxAttempts: number;
  lockoutMs: number;
  nowMs: number;
}): Promise<LockoutBucketState> {
  const nowDate = new Date(params.nowMs);
  const expiresDate = new Date(params.nowMs + params.lockoutMs);

  const rows = await platformAdminDb.$queryRaw<
    Array<{ count: number; windowStart: Date; expiresAt: Date }>
  >`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "expiresAt", "updatedAt")
    VALUES (${params.key}, 1, ${nowDate}, ${expiresDate}, ${nowDate})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= ${nowDate}
          THEN 1
        WHEN "RateLimitBucket"."count" >= ${params.maxAttempts}
          THEN ${params.maxAttempts}
        ELSE "RateLimitBucket"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= ${nowDate}
          THEN ${nowDate}
        WHEN "RateLimitBucket"."count" >= ${params.maxAttempts}
          THEN "RateLimitBucket"."windowStart"
        WHEN "RateLimitBucket"."count" + 1 >= ${params.maxAttempts}
          THEN ${nowDate}
        ELSE "RateLimitBucket"."windowStart"
      END,
      "expiresAt" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= ${nowDate}
          THEN ${expiresDate}
        WHEN "RateLimitBucket"."count" >= ${params.maxAttempts}
          THEN "RateLimitBucket"."expiresAt"
        ELSE ${expiresDate}
      END,
      "updatedAt" = ${nowDate}
    RETURNING "count", "windowStart", "expiresAt"
  `;

  const row = rows[0];
  if (!row) {
    return { failures: 1, lockedUntilMs: null };
  }

  const lockedUntilMs =
    row.count >= params.maxAttempts && row.expiresAt.getTime() > params.nowMs
      ? row.expiresAt.getTime()
      : null;

  return {
    failures: row.count,
    lockedUntilMs,
  };
}

/**
 * Deletes specific rate-limit bucket rows (e.g. on successful authentication).
 */
export async function deleteRateLimitBucketsByKeys(
  keys: string[],
): Promise<number> {
  if (keys.length === 0) return 0;
  const result = await platformAdminDb.rateLimitBucket.deleteMany({
    where: { key: { in: keys } },
  });
  return result.count;
}

/**
 * Deletes all buckets under a specific key prefix (used by scoped tests).
 */
export async function deleteRateLimitBucketsByPrefix(
  prefix: string,
): Promise<number> {
  const result = await platformAdminDb.rateLimitBucket.deleteMany({
    where: { key: { startsWith: prefix } },
  });
  return result.count;
}

/**
 * Deletes expired `RateLimitBucket` rows (`expiresAt < now`). Invoked by daily cron.
 */
export async function cleanupExpiredRateLimitBuckets(
  now: Date = new Date(),
): Promise<number> {
  const result = await platformAdminDb.rateLimitBucket.deleteMany({
    where: {
      expiresAt: { lt: now },
    },
  });
  return result.count;
}
