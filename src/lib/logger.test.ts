import { describe, expect, it, vi } from "vitest";
import {
  getCurrentLogContext,
  logger,
  maskPhoneNumber,
  redactSensitiveText,
  resolveRequestId,
  runWithLogContext,
  setLogContextFields,
} from "./logger";

describe("structured JSON logger", () => {
  it("resolves valid x-request-id or generates a UUID fallback", () => {
    const withReqId = new Headers({ "x-request-id": "req_abc-123" });
    expect(resolveRequestId(withReqId)).toBe("req_abc-123");

    const withInvalid = new Headers({ "x-request-id": "bad id with spaces\n" });
    expect(resolveRequestId(withInvalid)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("propagates requestId and tenantId across AsyncLocalStorage context", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await runWithLogContext({ requestId: "req-42" }, async () => {
        setLogContextFields({ tenantId: "tenant-shami" });
        await Promise.resolve();
        expect(getCurrentLogContext()).toEqual({
          requestId: "req-42",
          tenantId: "tenant-shami",
        });
        logger.info("test.event", { ok: true });
      });

      expect(infoSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(String(infoSpy.mock.calls[0]?.[0])) as Record<
        string,
        unknown
      >;
      expect(parsed).toMatchObject({
        level: "info",
        event: "test.event",
        requestId: "req-42",
        tenantId: "tenant-shami",
        ok: true,
      });
      expect(typeof parsed.timestamp).toBe("string");
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("redacts passwords, PINs, tokens, DB credentials, and full phone numbers", () => {
    expect(maskPhoneNumber("+966501234567")).toBe("***4567");
    expect(
      redactSensitiveText(
        "Failed connect postgres://admin:supersecret@db.internal:5432/wafrah with Bearer eyJhbGciOiJIUzI1NiJ9 and re_abc123456789; phone +966501234567 Temporary password: MySecretPass!",
      ),
    ).toBe(
      "Failed connect postgres://[REDACTED]@db.internal:5432/wafrah with Bearer [REDACTED] and re_[REDACTED]; phone ***4567 Temporary password: [REDACTED]",
    );

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      logger.error("auth.failed", {
        phone: "0559876543",
        password: "plaintext-password",
        pin: "1234",
        error: new Error("Token re_live_123456789 rejected for +966559876543"),
      });

      const parsed = JSON.parse(String(errSpy.mock.calls[0]?.[0])) as {
        phone: string;
        password: string;
        pin: string;
        error: { message: string };
      };
      expect(parsed.phone).toBe("***6543");
      expect(parsed.password).toBe("[REDACTED]");
      expect(parsed.pin).toBe("[REDACTED]");
      expect(parsed.error.message).toBe(
        "Token re_[REDACTED] rejected for ***6543",
      );
    } finally {
      errSpy.mockRestore();
    }
  });
});
