import { afterEach, describe, expect, it, vi } from "vitest";
import { canAccessPath, evaluateMiddlewareDecision } from "@/lib/authz-rules";
import { authConfig } from "./config";
import {
  applyJwtSessionPolicy,
  getTokenEncodeMaxAge,
  MANAGER_SESSION_MAX_AGE_SECONDS,
  type PolicyTokenShape,
  shouldUseSecureCookies,
  STAFF_SESSION_MAX_AGE_SECONDS,
} from "./session-policy";

describe("Security regression — Session lifetimes, cookie flags, and RBAC routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gives STAFF a fixed 12-hour session without sliding extension and expires after 12h", () => {
    const loginTime = 1_700_000_000;
    const initial = applyJwtSessionPolicy<PolicyTokenShape>(
      {},
      {
        id: "staff-1",
        userId: "staff-1",
        name: "Ahmed",
        role: "STAFF",
        tenantId: "tenant-1",
        locale: "ar",
      },
      loginTime,
    );

    expect(initial).not.toBeNull();
    expect(initial?.sessionExpiresAt).toBe(
      loginTime + STAFF_SESSION_MAX_AGE_SECONDS,
    );

    // Activity 6 hours later does NOT extend STAFF expiry
    const refreshed = applyJwtSessionPolicy(
      { ...initial },
      undefined,
      loginTime + 6 * 3600,
    );
    expect(refreshed?.sessionExpiresAt).toBe(
      loginTime + STAFF_SESSION_MAX_AGE_SECONDS,
    );
    expect(getTokenEncodeMaxAge(refreshed ?? undefined, loginTime + 6 * 3600)).toBe(
      6 * 3600,
    );

    // Exactly at 12 hours, session is invalidated
    const expired = applyJwtSessionPolicy(
      { ...initial },
      undefined,
      loginTime + STAFF_SESSION_MAX_AGE_SECONDS,
    );
    expect(expired).toBeNull();
  });

  it("gives MANAGER/OWNER/PLATFORM_ADMIN a 7-day session with sliding refresh on activity", () => {
    const loginTime = 1_700_000_000;
    const initial = applyJwtSessionPolicy<PolicyTokenShape>(
      {},
      {
        id: "mgr-1",
        userId: "mgr-1",
        name: "Fahad",
        role: "MANAGER",
        tenantId: "tenant-1",
        locale: "en",
      },
      loginTime,
    );

    expect(initial?.sessionExpiresAt).toBe(
      loginTime + MANAGER_SESSION_MAX_AGE_SECONDS,
    );

    // Active 3 days later -> expiry slides forward another 7 days
    const activeAt = loginTime + 3 * 24 * 3600;
    const slid = applyJwtSessionPolicy({ ...initial }, undefined, activeAt);
    expect(slid?.sessionExpiresAt).toBe(
      activeAt + MANAGER_SESSION_MAX_AGE_SECONDS,
    );

    // Idle past the slid 7-day expiry -> rejected
    const expired = applyJwtSessionPolicy(
      { ...slid },
      undefined,
      activeAt + MANAGER_SESSION_MAX_AGE_SECONDS,
    );
    expect(expired).toBeNull();
  });

  it("configures Auth.js cookies as httpOnly and sameSite=lax, and enables secure on HTTPS production", () => {
    expect(authConfig.cookies?.sessionToken?.options?.httpOnly).toBe(true);
    expect(authConfig.cookies?.sessionToken?.options?.sameSite).toBe("lax");
    expect(authConfig.cookies?.csrfToken?.options?.httpOnly).toBe(true);
    expect(authConfig.cookies?.csrfToken?.options?.sameSite).toBe("lax");
    expect(authConfig.cookies?.callbackUrl?.options?.httpOnly).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://app.wafrah.example");
    expect(shouldUseSecureCookies()).toBe(true);

    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(shouldUseSecureCookies()).toBe(false);
  });

  it("allows unauthenticated /privacy and /terms, fails closed on protected paths, and locks /api/export to MANAGER/OWNER", () => {
    expect(evaluateMiddlewareDecision("/privacy", null)).toEqual({
      type: "next",
    });
    expect(evaluateMiddlewareDecision("/terms", null)).toEqual({
      type: "next",
    });
    expect(evaluateMiddlewareDecision("/api/export", null)).toEqual({
      type: "json",
      status: 401,
      error: "Unauthenticated",
    });
    expect(canAccessPath("STAFF", "/api/export")).toBe(false);
    expect(canAccessPath("PLATFORM_ADMIN", "/api/export")).toBe(false);
    expect(canAccessPath("MANAGER", "/api/export")).toBe(true);
    expect(canAccessPath("OWNER", "/api/export")).toBe(true);
  });
});

describe("pilot routes authorization", () => {
  it("allows unauthenticated users to view /help", () => {
    expect(evaluateMiddlewareDecision("/help", null)).toEqual({ type: "next" });
    expect(evaluateMiddlewareDecision("/help/offline", null)).toEqual({
      type: "next",
    });
  });

  it("restricts /api/staff to MANAGER and OWNER and blocks unauthenticated callers", () => {
    expect(evaluateMiddlewareDecision("/api/staff", null)).toEqual({
      type: "json",
      status: 401,
      error: "Unauthenticated",
    });
    expect(canAccessPath("STAFF", "/api/staff")).toBe(false);
    expect(canAccessPath("STAFF", "/api/staff/u1/reset-pin")).toBe(false);
    expect(canAccessPath("MANAGER", "/api/staff")).toBe(true);
    expect(canAccessPath("OWNER", "/api/staff/u1/reset-pin")).toBe(true);
  });

  it("requires authentication for /api/feedback", () => {
    expect(evaluateMiddlewareDecision("/api/feedback", null)).toEqual({
      type: "json",
      status: 401,
      error: "Unauthenticated",
    });
    expect(evaluateMiddlewareDecision("/api/feedback", "STAFF")).toEqual({
      type: "next",
    });
    expect(evaluateMiddlewareDecision("/help", "STAFF")).toEqual({
      type: "next",
    });
  });
});
