import {
  deleteRateLimitBucketsByKeys,
  deleteRateLimitBucketsByPrefix,
  getLockoutBucketStates,
  type LockoutBucketState,
  recordLockoutFailureBucket,
} from "@/lib/rate-limit-store";

export const MAX_PIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const MAX_MANAGER_ATTEMPTS = 10;
export const MANAGER_LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

const EMPTY_BUCKET: LockoutBucketState = {
  failures: 0,
  lockedUntilMs: null,
};

interface LockoutPolicyConfig {
  prefix: "pin" | "manager";
  maxAttempts: number;
  lockoutDurationMs: number;
}

const pinPolicy: LockoutPolicyConfig = {
  prefix: "pin",
  maxAttempts: MAX_PIN_ATTEMPTS,
  lockoutDurationMs: LOCKOUT_DURATION_MS,
};

const managerPolicy: LockoutPolicyConfig = {
  prefix: "manager",
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

function buildBucketKeys(
  policy: LockoutPolicyConfig,
  input: RateLimitInput,
): { ipKey: string; acctKey: string } {
  return {
    ipKey: `${policy.prefix}:ip:${normalizeKey(input.ip)}`,
    acctKey: `${policy.prefix}:acct:${normalizeKey(input.accountKey)}`,
  };
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

function buildStatus(
  acctBucket: LockoutBucketState,
  ipBucket: LockoutBucketState,
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

async function checkRateLimitPolicy(
  policy: LockoutPolicyConfig,
  input: RateLimitInput,
): Promise<RateLimitStatus> {
  const now = input.now ?? Date.now();
  const { ipKey, acctKey } = buildBucketKeys(policy, input);
  const buckets = await getLockoutBucketStates({
    keys: [ipKey, acctKey],
    maxAttempts: policy.maxAttempts,
    nowMs: now,
  });

  return buildStatus(
    buckets.get(acctKey) ?? EMPTY_BUCKET,
    buckets.get(ipKey) ?? EMPTY_BUCKET,
    now,
    policy.maxAttempts,
  );
}

async function recordFailurePolicy(
  policy: LockoutPolicyConfig,
  input: RateLimitInput,
): Promise<RateLimitStatus> {
  const now = input.now ?? Date.now();
  const { ipKey, acctKey } = buildBucketKeys(policy, input);

  const [ipBucket, acctBucket] = await Promise.all([
    recordLockoutFailureBucket({
      key: ipKey,
      maxAttempts: policy.maxAttempts,
      lockoutMs: policy.lockoutDurationMs,
      nowMs: now,
    }),
    recordLockoutFailureBucket({
      key: acctKey,
      maxAttempts: policy.maxAttempts,
      lockoutMs: policy.lockoutDurationMs,
      nowMs: now,
    }),
  ]);

  return buildStatus(acctBucket, ipBucket, now, policy.maxAttempts);
}

async function resetRateLimitPolicy(
  policy: LockoutPolicyConfig,
  input: RateLimitInput,
): Promise<void> {
  const { ipKey, acctKey } = buildBucketKeys(policy, input);
  await deleteRateLimitBucketsByKeys([ipKey, acctKey]);
}

export async function checkPinRateLimit(
  input: RateLimitInput,
): Promise<RateLimitStatus> {
  return checkRateLimitPolicy(pinPolicy, input);
}

export async function recordPinFailure(
  input: RateLimitInput,
): Promise<RateLimitStatus> {
  return recordFailurePolicy(pinPolicy, input);
}

export async function resetPinRateLimit(
  input: RateLimitInput,
): Promise<void> {
  await resetRateLimitPolicy(pinPolicy, input);
}

export async function clearAllRateLimits(): Promise<void> {
  await deleteRateLimitBucketsByPrefix(`${pinPolicy.prefix}:`);
}

export async function checkManagerRateLimit(
  input: RateLimitInput,
): Promise<RateLimitStatus> {
  return checkRateLimitPolicy(managerPolicy, input);
}

export async function recordManagerFailure(
  input: RateLimitInput,
): Promise<RateLimitStatus> {
  return recordFailurePolicy(managerPolicy, input);
}

export async function resetManagerRateLimit(
  input: RateLimitInput,
): Promise<void> {
  await resetRateLimitPolicy(managerPolicy, input);
}

export async function clearAllManagerRateLimits(): Promise<void> {
  await deleteRateLimitBucketsByPrefix(`${managerPolicy.prefix}:`);
}
