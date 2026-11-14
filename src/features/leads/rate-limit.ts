import {
  consumeFixedWindowBucket,
  deleteRateLimitBucketsByPrefix,
} from "@/lib/rate-limit-store";

export const LEAD_SUBMIT_MAX_PER_HOUR = 5;
export const LEAD_SUBMIT_WINDOW_MS = 60 * 60 * 1000;

export interface LeadRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function normalizeIpKey(rawIp: string): string {
  const trimmed = rawIp.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : "unknown";
}

/**
 * Postgres-backed per-IP fixed-window limit (5 submissions / hour)
 * shared safely across serverless Vercel function instances.
 */
export async function checkLeadSubmitRateLimit(
  rawIp: string,
  nowMs = Date.now(),
): Promise<LeadRateLimitResult> {
  const result = await consumeFixedWindowBucket({
    key: `lead:submit:${normalizeIpKey(rawIp)}`,
    limit: LEAD_SUBMIT_MAX_PER_HOUR,
    windowMs: LEAD_SUBMIT_WINDOW_MS,
    nowMs,
  });

  return {
    allowed: result.allowed,
    remaining: result.remaining,
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

export async function clearLeadSubmitRateLimits(): Promise<void> {
  await deleteRateLimitBucketsByPrefix("lead:");
}
