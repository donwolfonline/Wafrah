import { NextResponse } from "next/server";
import {
  consumeFixedWindowBucket,
  deleteRateLimitBucketsByPrefix,
  type FixedWindowConsumeResult,
} from "@/lib/rate-limit-store";

export const IMPORT_UPLOAD_WINDOW_MS = 60 * 1000;
export const MAX_IMPORT_UPLOAD_REQUESTS = 10;

export const API_WRITE_WINDOW_MS = 60 * 1000;
export const MAX_API_WRITE_REQUESTS = 60;

export type SlidingWindowResult = FixedWindowConsumeResult;

function normalizeRateLimitKey(rawKey: string): string {
  return rawKey.trim().toLowerCase() || "unknown";
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

/**
 * Postgres-backed per-user/IP rate limit for heavy CSV import & export requests.
 */
export async function checkImportUploadRateLimit(
  key: string,
  now: number = Date.now(),
): Promise<SlidingWindowResult> {
  return consumeFixedWindowBucket({
    key: `api:import:${normalizeRateLimitKey(key)}`,
    limit: MAX_IMPORT_UPLOAD_REQUESTS,
    windowMs: IMPORT_UPLOAD_WINDOW_MS,
    nowMs: now,
  });
}

/**
 * Postgres-backed per-user/IP rate limit for API write mutations.
 */
export async function checkApiWriteRateLimit(
  key: string,
  now: number = Date.now(),
): Promise<SlidingWindowResult> {
  return consumeFixedWindowBucket({
    key: `api:write:${normalizeRateLimitKey(key)}`,
    limit: MAX_API_WRITE_REQUESTS,
    windowMs: API_WRITE_WINDOW_MS,
    nowMs: now,
  });
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

export async function clearAllApiRateLimits(): Promise<void> {
  await deleteRateLimitBucketsByPrefix("api:");
}
