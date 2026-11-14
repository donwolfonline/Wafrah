import type { Role } from "@prisma/client";

export const STAFF_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60; // 12 hours fixed
export const MANAGER_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days sliding

export function isStaffRole(role: Role | string | null | undefined): boolean {
  return role === "STAFF";
}

export function getMaxAgeForRole(
  role: Role | string | null | undefined,
): number {
  return isStaffRole(role)
    ? STAFF_SESSION_MAX_AGE_SECONDS
    : MANAGER_SESSION_MAX_AGE_SECONDS;
}

/**
 * Determines whether cookies should carry the `Secure` attribute (and Auth.js
 * `__Secure-` / `__Host-` prefixes). Disabled in non-production environments
 * and for explicit local HTTP origins (`http://localhost` / `http://127.0.0.1`)
 * so local production builds and Playwright E2E over HTTP still receive cookies.
 */
export function shouldUseSecureCookies(): boolean {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }
  const appUrl = (process.env.APP_URL ?? "").trim().toLowerCase();
  if (
    appUrl.startsWith("http://localhost") ||
    appUrl.startsWith("http://127.0.0.1")
  ) {
    return false;
  }
  return true;
}

export interface PolicyTokenShape {
  userId?: unknown;
  name?: unknown;
  role?: unknown;
  tenantId?: unknown;
  locale?: unknown;
  sub?: string;
  sessionIssuedAt?: unknown;
  sessionExpiresAt?: unknown;
  [key: string]: unknown;
}

export interface PolicyUserShape {
  id?: string | null;
  userId?: string;
  name?: string | null;
  role?: Role;
  tenantId?: string | null;
  locale?: string;
}

/**
 * Applies role-specific session lifetime rules to an Auth.js JWT payload:
 * - STAFF: fixed 12-hour window from sign-in (`sessionExpiresAt` never extends).
 * - MANAGER / OWNER / PLATFORM_ADMIN: 7-day sliding window refreshed on activity.
 *
 * Returns `null` once expired so Auth.js invalidates and clears the session.
 */
export function applyJwtSessionPolicy<T extends PolicyTokenShape>(
  token: T,
  user: PolicyUserShape | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): T | null {
  if (user) {
    const role = user.role ?? "STAFF";
    const ttl = getMaxAgeForRole(role);
    token.userId = user.userId ?? user.id ?? "";
    token.name = user.name;
    token.role = role;
    token.tenantId = user.tenantId ?? null;
    token.locale = user.locale ?? "ar";
    token.sessionIssuedAt = nowSeconds;
    token.sessionExpiresAt = nowSeconds + ttl;
    return token;
  }

  const role = typeof token.role === "string" ? token.role : null;
  if (!role || !(typeof token.userId === "string" || typeof token.sub === "string")) {
    return null;
  }

  const existingExpiresAt =
    typeof token.sessionExpiresAt === "number" ? token.sessionExpiresAt : null;

  if (existingExpiresAt !== null && nowSeconds >= existingExpiresAt) {
    return null;
  }

  const ttl = getMaxAgeForRole(role);
  if (isStaffRole(role)) {
    // Fixed lifetime for shared kitchen/staff devices: do not slide on activity.
    token.sessionExpiresAt = existingExpiresAt ?? nowSeconds + ttl;
  } else {
    // Sliding refresh window for managers/owners/platform admins.
    token.sessionExpiresAt = nowSeconds + ttl;
  }

  return token;
}

export function getTokenEncodeMaxAge(
  token: PolicyTokenShape | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): number {
  const role = typeof token?.role === "string" ? token.role : undefined;
  const fallback = getMaxAgeForRole(role);
  const expiresAt =
    typeof token?.sessionExpiresAt === "number" ? token.sessionExpiresAt : null;

  if (expiresAt === null) {
    return fallback;
  }
  const remaining = expiresAt - nowSeconds;
  return Math.max(1, Math.min(remaining, fallback));
}
