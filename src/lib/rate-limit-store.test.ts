import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  consumeFixedWindowBucket,
  deleteRateLimitBucketsByPrefix,
} from "./rate-limit-store";

describe("Postgres RateLimitBucket atomic upsert store", () => {
  const prefix = `test-atomic:${randomUUID()}:`;

  afterEach(async () => {
    await deleteRateLimitBucketsByPrefix(prefix);
  });

  it("serializes concurrent increments atomically without losing counts", async () => {
    const key = `${prefix}concurrent`;
    const nowMs = Date.now();
    const limit = 5;

    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () =>
        consumeFixedWindowBucket({
          key,
          limit,
          windowMs: 60_000,
          nowMs,
        }),
      ),
    );

    const allowedCount = outcomes.filter((o) => o.allowed).length;
    const blockedCount = outcomes.filter((o) => !o.allowed).length;

    expect(allowedCount).toBe(5);
    expect(blockedCount).toBe(5);
  });
});
