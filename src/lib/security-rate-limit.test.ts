import { beforeEach, describe, expect, it } from "vitest";
import {
  buildApiRateLimitKey,
  checkApiWriteRateLimit,
  checkImportUploadRateLimit,
  clearAllApiRateLimits,
  createRateLimitResponse,
  extractClientIpFromHeaders,
  IMPORT_UPLOAD_WINDOW_MS,
  MAX_API_WRITE_REQUESTS,
  MAX_IMPORT_UPLOAD_REQUESTS,
} from "./api-rate-limit";
import {
  buildManagerAccountKey,
  checkManagerRateLimit,
  clearAllManagerRateLimits,
  clearAllRateLimits,
  MANAGER_LOCKOUT_DURATION_MS,
  MAX_MANAGER_ATTEMPTS,
  recordManagerFailure,
  resetManagerRateLimit,
} from "./rate-limit";

describe("Security regression — Manager & API rate limiters", () => {
  beforeEach(async () => {
    await clearAllRateLimits();
    await clearAllManagerRateLimits();
    await clearAllApiRateLimits();
  });

  it("locks manager login after 10 failures for 30 minutes and resets on success", async () => {
    const start = 1_700_000_000_000;
    const key = buildManagerAccountKey("Manager@Shami.sa");

    for (let i = 1; i < MAX_MANAGER_ATTEMPTS; i++) {
      const res = await recordManagerFailure({
        ip: "10.0.0.1",
        accountKey: key,
        now: start + i * 1000,
      });
      expect(res.allowed).toBe(true);
      expect(res.remainingAttempts).toBe(MAX_MANAGER_ATTEMPTS - i);
    }

    const locked = await recordManagerFailure({
      ip: "10.0.0.1",
      accountKey: key,
      now: start + 10_000,
    });
    expect(locked.allowed).toBe(false);
    expect(locked.lockedOut).toBe(true);
    expect(locked.retryAfterSeconds).toBeGreaterThanOrEqual(
      Math.floor(MANAGER_LOCKOUT_DURATION_MS / 1000) - 1,
    );

    const duringLock = await checkManagerRateLimit({
      ip: "10.0.0.2",
      accountKey: key,
      now: start + 15 * 60 * 1000,
    });
    expect(duringLock.allowed).toBe(false);
    expect(duringLock.reason).toBe("ACCOUNT_LOCKED");

    const afterLock = await checkManagerRateLimit({
      ip: "10.0.0.2",
      accountKey: key,
      now: start + 10_000 + MANAGER_LOCKOUT_DURATION_MS + 1,
    });
    expect(afterLock.allowed).toBe(true);
    expect(afterLock.remainingAttempts).toBe(MAX_MANAGER_ATTEMPTS);

    await recordManagerFailure({ ip: "10.0.0.9", accountKey: key, now: start });
    await resetManagerRateLimit({ ip: "10.0.0.9", accountKey: key });
    const resetCheck = await checkManagerRateLimit({
      ip: "10.0.0.9",
      accountKey: key,
      now: start + 100,
    });
    expect(resetCheck.remainingAttempts).toBe(MAX_MANAGER_ATTEMPTS);
  });

  it("enforces 10 requests/min import upload rate limit and returns 429 with Retry-After", async () => {
    const start = 1_700_000_000_000;
    const key = buildApiRateLimitKey({
      userId: "user-1",
      ip: "192.0.2.1",
      scope: "imports-parse",
    });

    for (let i = 0; i < MAX_IMPORT_UPLOAD_REQUESTS; i++) {
      const res = await checkImportUploadRateLimit(key, start + i * 500);
      expect(res.allowed).toBe(true);
    }

    const blocked = await checkImportUploadRateLimit(key, start + 6000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    const response = createRateLimitResponse(blocked);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);

    const afterWindow = await checkImportUploadRateLimit(
      key,
      start + IMPORT_UPLOAD_WINDOW_MS + 1,
    );
    expect(afterWindow.allowed).toBe(true);
  });

  it("enforces 60 requests/min API write rate limit and parses forwarded IP headers", async () => {
    const start = 1_700_000_000_000;
    const headers = new Headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" });
    expect(extractClientIpFromHeaders(headers)).toBe("203.0.113.10");

    const key = buildApiRateLimitKey({
      userId: "user-2",
      ip: extractClientIpFromHeaders(headers),
      scope: "waste-entries-write",
    });

    for (let i = 0; i < MAX_API_WRITE_REQUESTS; i++) {
      expect((await checkApiWriteRateLimit(key, start + i * 100)).allowed).toBe(true);
    }

    const blocked = await checkApiWriteRateLimit(key, start + 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});
