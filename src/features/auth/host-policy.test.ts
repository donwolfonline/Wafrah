import { decode, encode } from "next-auth/jwt";
import { describe, expect, it } from "vitest";
import { authConfig } from "./config";
import {
  resolveSafeAuthRedirectUrl,
  shouldTrustAuthHost,
} from "./host-policy";
import { shouldUseSecureCookies } from "./session-policy";

describe("Auth.js production host, cookies, redirect & secret rotation", () => {
  it("trusts reverse-proxy hosts on Vercel and production unless explicitly disabled", () => {
    expect(shouldTrustAuthHost({})).toBe(true);
    expect(shouldTrustAuthHost({ VERCEL: "1", NODE_ENV: "production" })).toBe(
      true,
    );
    expect(
      shouldTrustAuthHost({
        VERCEL: "1",
        VERCEL_ENV: "production",
        NODE_ENV: "production",
        APP_URL: "https://wafrah.sa",
      }),
    ).toBe(true);
    expect(shouldTrustAuthHost({ AUTH_TRUST_HOST: "true" })).toBe(true);
    expect(shouldTrustAuthHost({ AUTH_TRUST_HOST: "false" })).toBe(false);
  });

  it("sets trustHost: true and httpOnly / sameSite=lax cookie flags on authConfig", () => {
    expect(authConfig.trustHost).toBe(true);

    const expectedSecure = shouldUseSecureCookies();
    expect(authConfig.useSecureCookies).toBe(expectedSecure);

    const cookies = authConfig.cookies;
    expect(cookies?.sessionToken?.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: expectedSecure,
    });
    expect(cookies?.csrfToken?.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: expectedSecure,
    });
    expect(cookies?.callbackUrl?.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: expectedSecure,
    });
  });

  it("allows relative and trusted-origin redirects while blocking open redirects", () => {
    const baseUrl = "https://wafrah.sa";
    const allowedOrigins = ["https://app.wafrah.sa", "https://wafrah.sa"];

    expect(
      resolveSafeAuthRedirectUrl({
        url: "/dashboard?range=30d",
        baseUrl,
        allowedOrigins,
      }),
    ).toBe("https://wafrah.sa/dashboard?range=30d");

    expect(
      resolveSafeAuthRedirectUrl({
        url: "https://wafrah.sa/log",
        baseUrl,
        allowedOrigins,
      }),
    ).toBe("https://wafrah.sa/log");

    expect(
      resolveSafeAuthRedirectUrl({
        url: "https://app.wafrah.sa/admin",
        baseUrl,
        allowedOrigins,
      }),
    ).toBe("https://app.wafrah.sa/admin");

    expect(
      resolveSafeAuthRedirectUrl({
        url: "//evil.example.com/steal",
        baseUrl,
        allowedOrigins,
      }),
    ).toBe("https://wafrah.sa");

    expect(
      resolveSafeAuthRedirectUrl({
        url: "https://evil.example.com/phish",
        baseUrl,
        allowedOrigins,
      }),
    ).toBe("https://wafrah.sa");

    expect(
      resolveSafeAuthRedirectUrl({
        url: "javascript:alert(1)",
        baseUrl,
        allowedOrigins,
      }),
    ).toBe("https://wafrah.sa");
  });

  it("invalidates existing encrypted JWE session tokens when AUTH_SECRET rotates", async () => {
    const oldSecret = "old-secret-at-least-32-characters-long-111111";
    const newSecret = "new-secret-at-least-32-characters-long-222222";
    const salt = "__Secure-authjs.session-token";

    const issuedJwt = await encode({
      token: {
        sub: "user_123",
        userId: "user_123",
        role: "MANAGER",
        tenantId: "tenant_1",
      },
      secret: oldSecret,
      salt,
      maxAge: 604_800,
    });

    const verifiedWithOld = await decode({
      token: issuedJwt,
      secret: oldSecret,
      salt,
    });
    expect(verifiedWithOld?.userId).toBe("user_123");

    await expect(
      decode({
        token: issuedJwt,
        secret: newSecret,
        salt,
      }),
    ).rejects.toThrow();
  });
});
