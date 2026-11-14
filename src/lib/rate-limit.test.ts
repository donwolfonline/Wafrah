import { beforeEach, describe, expect, it } from "vitest";
import { authenticateStaffPin } from "@/features/auth/authorize";
import {
  buildPinAccountKey,
  checkPinRateLimit,
  clearAllRateLimits,
  LOCKOUT_DURATION_MS,
  MAX_PIN_ATTEMPTS,
  recordPinFailure,
  resetPinRateLimit,
} from "@/lib/rate-limit";

describe("PIN rate limiting and 5-failure lockout", () => {
  beforeEach(async () => {
    await clearAllRateLimits();
  });

  it("locks out an account after 5 failed PIN attempts and unlocks after the lockout window", async () => {
    const ip = "192.0.2.10";
    const accountKey = buildPinAccountKey("SHAMI-JED", "ahmed");
    const t0 = 1_700_000_000_000;

    expect((await checkPinRateLimit({ ip, accountKey, now: t0 })).allowed).toBe(true);

    for (let attempt = 1; attempt < MAX_PIN_ATTEMPTS; attempt++) {
      const status = await recordPinFailure({ ip, accountKey, now: t0 });
      expect(status.lockedOut).toBe(false);
      expect(status.allowed).toBe(true);
      expect(status.remainingAttempts).toBe(MAX_PIN_ATTEMPTS - attempt);
    }

    // 5th bad PIN triggers lockout
    const fifthAttempt = await recordPinFailure({ ip, accountKey, now: t0 });
    expect(fifthAttempt.lockedOut).toBe(true);
    expect(fifthAttempt.allowed).toBe(false);
    expect(fifthAttempt.remainingAttempts).toBe(0);
    expect(fifthAttempt.retryAfterSeconds).toBe(LOCKOUT_DURATION_MS / 1000);

    // Subsequent check during lockout window is blocked even from a different IP
    const blockedCheck = await checkPinRateLimit({
      ip: "192.0.2.99",
      accountKey,
      now: t0 + 60_000,
    });
    expect(blockedCheck.allowed).toBe(false);
    expect(blockedCheck.lockedOut).toBe(true);

    // After the 15-minute lockout window expires, attempts are allowed again
    const afterLockout = await checkPinRateLimit({
      ip,
      accountKey,
      now: t0 + LOCKOUT_DURATION_MS + 1,
    });
    expect(afterLockout.allowed).toBe(true);
    expect(afterLockout.remainingAttempts).toBe(MAX_PIN_ATTEMPTS);
  });

  it("locks out an IP address after 5 failed PIN attempts across different usernames", async () => {
    const sharedIp = "198.51.100.42";
    const restaurantCode = "SHAMI-JED";
    const t0 = 1_700_000_000_000;

    for (let i = 1; i <= 4; i++) {
      const res = await recordPinFailure({
        ip: sharedIp,
        accountKey: buildPinAccountKey(restaurantCode, `user${i}`),
        now: t0,
      });
      expect(res.lockedOut).toBe(false);
    }

    const fifth = await recordPinFailure({
      ip: sharedIp,
      accountKey: buildPinAccountKey(restaurantCode, "user5"),
      now: t0,
    });
    expect(fifth.lockedOut).toBe(true);
    expect(fifth.allowed).toBe(false);

    // A 6th username from the same IP is immediately blocked
    const sixthCheck = await checkPinRateLimit({
      ip: sharedIp,
      accountKey: buildPinAccountKey(restaurantCode, "user6"),
      now: t0 + 1_000,
    });
    expect(sixthCheck.allowed).toBe(false);
    expect(sixthCheck.lockedOut).toBe(true);
  });

  it("enforces 5-attempt lockout end-to-end in authenticateStaffPin against seeded staff user", async () => {
    const ip = "203.0.113.55";
    const restaurantCode = "SHAMI-JED";
    const username = "ahmed";
    const accountKey = buildPinAccountKey(restaurantCode, username);

    // Attempts 1..4 with wrong PIN return INVALID_PIN
    for (let i = 1; i <= 4; i++) {
      const outcome = await authenticateStaffPin(
        { restaurantCode, username, pin: "9999" },
        ip,
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.code).toBe("INVALID_PIN");
        expect(outcome.remainingAttempts).toBe(5 - i);
      }
    }

    // Attempt 5 with wrong PIN triggers RATE_LIMITED
    const fifthOutcome = await authenticateStaffPin(
      { restaurantCode, username, pin: "9999" },
      ip,
    );
    expect(fifthOutcome.ok).toBe(false);
    if (!fifthOutcome.ok) {
      expect(fifthOutcome.code).toBe("RATE_LIMITED");
      expect(fifthOutcome.remainingAttempts).toBe(0);
    }

    // Attempt 6 even with the CORRECT PIN ("1234") is still blocked while locked out
    const blockedValidPin = await authenticateStaffPin(
      { restaurantCode, username, pin: "1234" },
      ip,
    );
    expect(blockedValidPin.ok).toBe(false);
    if (!blockedValidPin.ok) {
      expect(blockedValidPin.code).toBe("RATE_LIMITED");
    }

    // Reset rate limit and verify valid PIN ("1234") succeeds
    await resetPinRateLimit({ ip, accountKey });
    const successOutcome = await authenticateStaffPin(
      { restaurantCode, username, pin: "1234" },
      ip,
    );
    expect(successOutcome.ok).toBe(true);
    if (successOutcome.ok) {
      expect(successOutcome.user.role).toBe("STAFF");
      expect(successOutcome.user.name).toBe("Ahmed Al-Zahrani");
    }
  });
});
