import { NextResponse } from "next/server";

/**
 * In-memory sliding-window API rate limiter designed for single-instance or
 * dependency-free serverless execution.
 *
 * Tradeoff: In multi-instance or serverless deployments (e.g. multiple Vercel
 * lambda containers), each instance maintains its own Map, so limits apply per
 * warm container rather than globally across the fleet. Upgrade to a shared
 * Upstash Redis / KV store when running multiple concurrent instances.
 */

export const IMPORT_UPLOAD_WINDOW_MS = 60 * 1000;
export const MAX_IMPORT_UPLOAD_REQUESTS = 10;

export const API_WRITE_WINDOW_MS = 60 * 1000;
export const MAX_API_WRITE_REQUESTS = 60;

const MAX_WINDOW_BUCKETS = 10_000;

export interface SlidingWindowResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

const importUploadBuckets = new Map<string, number[]>();
const apiWriteBuckets = new Map<string, number[]>();

function normalizeRateLimitKey(rawKey: string): string {
  return rawKey.trim().toLowerCase() || "unknown";
}

function pruneWindowStore(
  store: Map<string, number[]>,
  now: number,
  windowMs: number,
): void {
  if (store.size < MAX_WINDOW_BUCKETS) {
    return;
  }
  const cutoff = now - windowMs;
  for (const [key, timestamps] of store.entries()) {
    const active = timestamps.filter((ts) => ts > cutoff);
    if (active.length === 0) {
      store.delete(key);
    } else {
      store.set(key, active);
    }
  }
  while (store.size >= MAX_WINDOW_BUCKETS) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
}

function consumeSlidingWindow(
  store: Map<string, number[]>,
  rawKey: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): SlidingWindowResult {
  const key = normalizeRateLimitKey(rawKey);
  pruneWindowStore(store, now, windowMs);

  const cutoff = now - windowMs;
  const recent = (store.get(key) ?? []).filter((ts) => ts > cutoff);

  if (recent.length >= limit) {
    const oldestInWindow = recent[0] ?? now;
    const retryAfterMs = Math.max(1000, oldestInWindow + windowMs - now);
    store.set(key, recent);
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  recent.push(now);
  store.set(key, recent);
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - recent.length),
    retryAfterSeconds: 0,
  };
}

export function extractClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function buildApiRateLimitKey(params: {
  userId?: string | null;
  ip?: string | null;
  scope: string;
}): string {
  const actor = params.userId?.trim() || params.ip?.trim() || "unknown";
  return `${params.scope}:${actor}`;
}

export function checkImportUploadRateLimit(
  key: string,
  now: number = Date.now(),
): SlidingWindowResult {
  return consumeSlidingWindow(
    importUploadBuckets,
    key,
    MAX_IMPORT_UPLOAD_REQUESTS,
    IMPORT_UPLOAD_WINDOW_MS,
    now,
  );
}

export function checkApiWriteRateLimit(
  key: string,
  now: number = Date.now(),
): SlidingWindowResult {
  return consumeSlidingWindow(
    apiWriteBuckets,
    key,
    MAX_API_WRITE_REQUESTS,
    API_WRITE_WINDOW_MS,
    now,
  );
}

export function createRateLimitResponse(
  result: SlidingWindowResult,
): NextResponse {
  return NextResponse.json(
    {
      error: "Too many requests",
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    },
  );
}

export function clearAllApiRateLimits(): void {
  importUploadBuckets.clear();
  apiWriteBuckets.clear();
}
