export const LEAD_SUBMIT_MAX_PER_HOUR = 5;
export const LEAD_SUBMIT_WINDOW_MS = 60 * 60 * 1000;

interface SlidingWindowState {
  timestamps: number[];
}

export interface LeadRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const leadSubmitWindows = new Map<string, SlidingWindowState>();

function normalizeIpKey(rawIp: string): string {
  const trimmed = rawIp.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : "unknown";
}

/**
 * Dependency-light per-IP sliding window limit (5 submissions / hour)
 * shared across lead capture POST calls in the running server instance.
 */
export function checkLeadSubmitRateLimit(
  rawIp: string,
  nowMs = Date.now(),
): LeadRateLimitResult {
  const key = normalizeIpKey(rawIp);
  const cutoff = nowMs - LEAD_SUBMIT_WINDOW_MS;
  const existing = leadSubmitWindows.get(key);
  const timestamps = existing
    ? existing.timestamps.filter((ts) => ts > cutoff)
    : [];

  if (timestamps.length >= LEAD_SUBMIT_MAX_PER_HOUR) {
    const oldestActive = timestamps[0] ?? nowMs;
    const retryAfterMs = Math.max(1000, oldestActive + LEAD_SUBMIT_WINDOW_MS - nowMs);
    leadSubmitWindows.set(key, { timestamps });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  timestamps.push(nowMs);
  leadSubmitWindows.set(key, { timestamps });
  return {
    allowed: true,
    remaining: Math.max(0, LEAD_SUBMIT_MAX_PER_HOUR - timestamps.length),
    retryAfterSeconds: 0,
  };
}

export function clearLeadSubmitRateLimits(): void {
  leadSubmitWindows.clear();
}
