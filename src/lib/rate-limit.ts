export const MAX_PIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const MAX_MANAGER_ATTEMPTS = 10;
export const MANAGER_LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

const MAX_BUCKET_ENTRIES = 10_000;

interface AttemptBucket {
  failures: number;
  lockedUntilMs: number | null;
  lastAttemptMs: number;
}

interface BucketPolicy {
  ipBuckets: Map<string, AttemptBucket>;
  accountBuckets: Map<string, AttemptBucket>;
  maxAttempts: number;
  lockoutDurationMs: number;
}

const pinPolicy: BucketPolicy = {
  ipBuckets: new Map<string, AttemptBucket>(),
  accountBuckets: new Map<string, AttemptBucket>(),
  maxAttempts: MAX_PIN_ATTEMPTS,
  lockoutDurationMs: LOCKOUT_DURATION_MS,
};

const managerPolicy: BucketPolicy = {
  ipBuckets: new Map<string, AttemptBucket>(),
  accountBuckets: new Map<string, AttemptBucket>(),
  maxAttempts: MAX_MANAGER_ATTEMPTS,
  lockoutDurationMs: MANAGER_LOCKOUT_DURATION_MS,
};

export interface RateLimitInput {
  ip: string;
  accountKey: string;
  now?: number;
}

export interface RateLimitStatus {
  allowed: boolean;
  lockedOut: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
  lockedUntil: Date | null;
  reason?: "IP_LOCKED" | "ACCOUNT_LOCKED";
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase() || "unknown";
}

export function buildPinAccountKey(
  restaurantCode: string,
  username: string,
): string {
  return `${normalizeKey(restaurantCode)}:${normalizeKey(username)}`;
}

export function buildManagerAccountKey(email: string): string {
  return normalizeKey(email);
}

function pruneExpiredBuckets(
  store: Map<string, AttemptBucket>,
  now: number,
  lockoutDurationMs: number,
): void {
  if (store.size < MAX_BUCKET_ENTRIES) {
    return;
  }
  for (const [key, bucket] of store.entries()) {
    const expiredLock =
      bucket.lockedUntilMs !== null && now >= bucket.lockedUntilMs;
    const staleIdle =
      bucket.lockedUntilMs === null &&
      now - bucket.lastAttemptMs >= lockoutDurationMs;
    if (expiredLock || staleIdle) {
      store.delete(key);
    }
  }
  while (store.size >= MAX_BUCKET_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
}

function getActiveBucket(
  store: Map<string, AttemptBucket>,
  key: string,
  now: number,
): AttemptBucket {
  const existing = store.get(key);
  if (!existing) {
    return { failures: 0, lockedUntilMs: null, lastAttemptMs: now };
  }
  if (existing.lockedUntilMs !== null && now >= existing.lockedUntilMs) {
    const reset: AttemptBucket = {
      failures: 0,
      lockedUntilMs: null,
      lastAttemptMs: now,
    };
    store.set(key, reset);
    return reset;
  }
  return existing;
}

function incrementBucket(
  store: Map<string, AttemptBucket>,
  key: string,
  now: number,
  maxAttempts: number,
  lockoutDurationMs: number,
): AttemptBucket {
  pruneExpiredBuckets(store, now, lockoutDurationMs);
  const current = getActiveBucket(store, key, now);
  const failures = current.failures + 1;
  const lockedUntilMs =
    failures >= maxAttempts ? now + lockoutDurationMs : null;
  const updated: AttemptBucket = {
    failures,
    lockedUntilMs,
    lastAttemptMs: now,
  };
  store.set(key, updated);
  return updated;
}

function buildStatus(
  acctBucket: AttemptBucket,
  ipBucket: AttemptBucket,
  now: number,
  maxAttempts: number,
): RateLimitStatus {
  if (acctBucket.lockedUntilMs !== null && acctBucket.lockedUntilMs > now) {
    return {
      allowed: false,
      lockedOut: true,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil((acctBucket.lockedUntilMs - now) / 1000),
      lockedUntil: new Date(acctBucket.lockedUntilMs),
      reason: "ACCOUNT_LOCKED",
    };
  }

  if (ipBucket.lockedUntilMs !== null && ipBucket.lockedUntilMs > now) {
    return {
      allowed: false,
      lockedOut: true,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil((ipBucket.lockedUntilMs - now) / 1000),
      lockedUntil: new Date(ipBucket.lockedUntilMs),
      reason: "IP_LOCKED",
    };
  }

  const maxFailures = Math.max(acctBucket.failures, ipBucket.failures);
  return {
    allowed: true,
    lockedOut: false,
    remainingAttempts: Math.max(0, maxAttempts - maxFailures),
    retryAfterSeconds: 0,
    lockedUntil: null,
  };
}

function checkRateLimitPolicy(
  policy: BucketPolicy,
  input: RateLimitInput,
): RateLimitStatus {
  const now = input.now ?? Date.now();
  const ipKey = normalizeKey(input.ip);
  const acctKey = normalizeKey(input.accountKey);
  const acctBucket = getActiveBucket(policy.accountBuckets, acctKey, now);
  const ipBucket = getActiveBucket(policy.ipBuckets, ipKey, now);
  return buildStatus(acctBucket, ipBucket, now, policy.maxAttempts);
}

function recordFailurePolicy(
  policy: BucketPolicy,
  input: RateLimitInput,
): RateLimitStatus {
  const now = input.now ?? Date.now();
  const ipKey = normalizeKey(input.ip);
  const acctKey = normalizeKey(input.accountKey);
  const acctBucket = incrementBucket(
    policy.accountBuckets,
    acctKey,
    now,
    policy.maxAttempts,
    policy.lockoutDurationMs,
  );
  const ipBucket = incrementBucket(
    policy.ipBuckets,
    ipKey,
    now,
    policy.maxAttempts,
    policy.lockoutDurationMs,
  );
  return buildStatus(acctBucket, ipBucket, now, policy.maxAttempts);
}

function resetRateLimitPolicy(
  policy: BucketPolicy,
  input: RateLimitInput,
): void {
  policy.accountBuckets.delete(normalizeKey(input.accountKey));
  policy.ipBuckets.delete(normalizeKey(input.ip));
}

export function checkPinRateLimit(input: RateLimitInput): RateLimitStatus {
  return checkRateLimitPolicy(pinPolicy, input);
}

export function recordPinFailure(input: RateLimitInput): RateLimitStatus {
  return recordFailurePolicy(pinPolicy, input);
}

export function resetPinRateLimit(input: RateLimitInput): void {
  resetRateLimitPolicy(pinPolicy, input);
}

export function clearAllRateLimits(): void {
  pinPolicy.ipBuckets.clear();
  pinPolicy.accountBuckets.clear();
}

export function checkManagerRateLimit(input: RateLimitInput): RateLimitStatus {
  return checkRateLimitPolicy(managerPolicy, input);
}

export function recordManagerFailure(input: RateLimitInput): RateLimitStatus {
  return recordFailurePolicy(managerPolicy, input);
}

export function resetManagerRateLimit(input: RateLimitInput): void {
  resetRateLimitPolicy(managerPolicy, input);
}

export function clearAllManagerRateLimits(): void {
  managerPolicy.ipBuckets.clear();
  managerPolicy.accountBuckets.clear();
}
