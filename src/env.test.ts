import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseClientEnv } from "./env.client";
import { validateMigrationEnv } from "./env.core";
import { parseServerEnv, validateEnv } from "./env";

function validProductionEnv(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    DATABASE_URL:
      "postgresql://wafrah_user:secretpass@ep-cool-host-pooler.eu-central-1.aws.neon.tech/wafrah?sslmode=require",
    DIRECT_URL:
      "postgresql://wafrah_user:secretpass@ep-cool-host.eu-central-1.aws.neon.tech/wafrah?sslmode=require",
    AUTH_SECRET: "a9f3e7b1c5d80246f0e1a2b3c4d5e6f7a8b9c0d1",
    APP_URL: "https://app.wafrah.sa",
    NEXT_PUBLIC_SITE_URL: "https://wafrah.sa",
    RESEND_API_KEY: "re_live_valid_key_1234567890",
    EMAIL_FROM: "Wafrah <notifications@wafrah.sa>",
    CRON_SECRET: "cron_prod_secret_0123456789abcdef",
    NEXT_PUBLIC_WHATSAPP_NUMBER: "966551234567",
    FOUNDER_EMAIL: "founder@wafrah.sa",
    NEXT_PUBLIC_ANALYTICS_PROVIDER: "",
    ...overrides,
  };
}

describe("environment validation (src/env & src/env.client)", () => {
  it("accepts a complete valid production configuration with optional analytics omitted", () => {
    const parsed = validateEnv(validProductionEnv());

    expect(parsed.NODE_ENV).toBe("production");
    expect(parsed.VERCEL_ENV).toBe("production");
    expect(parsed.APP_URL).toBe("https://app.wafrah.sa");
    expect(parsed.NEXT_PUBLIC_SITE_URL).toBe("https://wafrah.sa");
    expect(parsed.NEXT_PUBLIC_ANALYTICS_PROVIDER).toBeUndefined();
  });

  it("rejects missing required variables in production with clear variable names and zero leaked values", () => {
    let caughtError: Error | null = null;
    try {
      validateEnv({
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV: "production",
      });
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    const message = caughtError?.message ?? "";
    for (const expectedKey of [
      "DATABASE_URL",
      "AUTH_SECRET",
      "CRON_SECRET",
      "RESEND_API_KEY",
      "APP_URL",
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_WHATSAPP_NUMBER",
      "FOUNDER_EMAIL",
    ]) {
      expect(message).toContain(expectedKey);
    }
  });

  it("rejects short AUTH_SECRET (<32) and short CRON_SECRET (<16) without echoing secret values", () => {
    const shortAuth = "too-short-auth-secret-123";
    const shortCron = "short-cron-12";

    let caughtError: Error | null = null;
    try {
      parseServerEnv(
        validProductionEnv({
          AUTH_SECRET: shortAuth,
          CRON_SECRET: shortCron,
        }),
      );
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    const message = caughtError?.message ?? "";
    expect(message).toContain("AUTH_SECRET");
    expect(message).toContain("CRON_SECRET");
    expect(message).not.toContain(shortAuth);
    expect(message).not.toContain(shortCron);
  });

  it("rejects placeholder or localhost values in production and never leaks invalid enum values", () => {
    const leakedToken = "INVALID_VERCEL_TIER_SECRET_XYZ";

    let caughtError: Error | null = null;
    try {
      validateEnv(
        validProductionEnv({
          VERCEL_ENV: leakedToken,
          AUTH_SECRET: "replace-with-a-secure-random-secret",
          CRON_SECRET: "replace-with-cron-secret",
          RESEND_API_KEY: "re_replace_with_api_key",
        }),
      );
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    const message = caughtError?.message ?? "";
    expect(message).toContain("VERCEL_ENV");
    expect(message).not.toContain(leakedToken);
    expect(message).not.toContain("replace-with-a-secure-random-secret");
    expect(message).not.toContain("replace-with-cron-secret");
    expect(message).not.toContain("re_replace_with_api_key");
  });

  it("allows serverless runtime without DIRECT_URL when pooled DATABASE_URL is configured, while migration validation requires DIRECT_URL", () => {
    const runtime = validateEnv(
      validProductionEnv({
        DIRECT_URL: undefined,
      }),
    );
    expect(runtime.DATABASE_URL).toContain("-pooler.");
    expect(runtime.DIRECT_URL).toBeUndefined();

    expect(() =>
      validateMigrationEnv(
        validProductionEnv({
          DIRECT_URL: undefined,
        }),
      ),
    ).toThrow(/DIRECT_URL/);
  });

  it("enforces core DB & AUTH_SECRET in Vercel Preview without requiring CRON_SECRET, RESEND_API_KEY, or prod URLs", () => {
    const preview = validateEnv({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "preview",
      DATABASE_URL:
        "postgresql://staging:pass@db.staging.example.com:5432/wafrah",
      AUTH_SECRET: "staging-auth-secret-at-least-32-chars-long",
    });

    expect(preview.VERCEL_ENV).toBe("preview");
    expect(preview.CRON_SECRET).toBeUndefined();
    expect(preview.RESEND_API_KEY).toBeUndefined();
    expect(preview.APP_URL).toBeUndefined();
    expect(preview.NEXT_PUBLIC_SITE_URL).toBeUndefined();

    let previewErr: Error | null = null;
    try {
      validateEnv({
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV: "preview",
        DATABASE_URL: "postgresql://localhost:5432/wafrah",
        AUTH_SECRET: "short",
      });
    } catch (error) {
      previewErr = error as Error;
    }

    expect(previewErr).toBeInstanceOf(Error);
    expect(previewErr?.message).toContain("DATABASE_URL");
    expect(previewErr?.message).toContain("AUTH_SECRET");
  });

  it("keeps client env validation strictly isolated to NEXT_PUBLIC_* fields", () => {
    const client = parseClientEnv({
      NEXT_PUBLIC_SITE_URL: "https://wafrah.sa",
      NEXT_PUBLIC_WHATSAPP_NUMBER: "966551234567",
      NEXT_PUBLIC_ANALYTICS_PROVIDER: "plausible",
      AUTH_SECRET: "should-be-stripped",
      DATABASE_URL: "should-be-stripped",
    });

    expect(client).toEqual({
      NEXT_PUBLIC_SITE_URL: "https://wafrah.sa",
      NEXT_PUBLIC_APP_URL: undefined,
      NEXT_PUBLIC_WHATSAPP_NUMBER: "966551234567",
      NEXT_PUBLIC_ANALYTICS_PROVIDER: "plausible",
    });
    expect("AUTH_SECRET" in client).toBe(false);
    expect("DATABASE_URL" in client).toBe(false);
  });

  it("fails fast at module startup when imported in production outside Vitest", () => {
    const secretMarker = "my-ultra-short-secret";
    let stderr = "";
    let exitCode = 0;

    try {
      execFileSync("./node_modules/.bin/tsx", ["-e", "import './src/env'"], {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: "production",
          AUTH_SECRET: secretMarker,
        },
        stdio: "pipe",
      });
    } catch (error) {
      const err = error as { status?: number; stderr?: Buffer };
      exitCode = err.status ?? 1;
      stderr = err.stderr?.toString("utf8") ?? "";
    }

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("AUTH_SECRET");
    expect(stderr).toContain("DATABASE_URL");
    expect(stderr).toContain("CRON_SECRET");
    expect(stderr).not.toContain(secretMarker);
  });
});
