import { recordAuditLog } from "@/lib/audit";
import type { SessionUser } from "@/lib/authz";
import { platformAdminDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { verifySecret } from "@/lib/password";
import {
  buildManagerAccountKey,
  buildPinAccountKey,
  checkManagerRateLimit,
  checkPinRateLimit,
  recordManagerFailure,
  recordPinFailure,
  resetManagerRateLimit,
  resetPinRateLimit,
} from "@/lib/rate-limit";
import { managerLoginSchema, staffPinLoginSchema } from "./schemas";

export type AuthFailureCode =
  | "VALIDATION_FAILED"
  | "INVALID_CREDENTIALS"
  | "INVALID_PIN"
  | "RATE_LIMITED"
  | "TENANT_SUSPENDED";

export type AuthOutcome =
  | { ok: true; user: SessionUser }
  | {
      ok: false;
      code: AuthFailureCode;
      remainingAttempts?: number;
      retryAfterSeconds?: number;
    };

async function recordLastLoginSafely(userId: string): Promise<void> {
  try {
    await platformAdminDb.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  } catch (error) {
    logger.error("auth.last_login_update_failed", { userId, error });
  }
}

export async function authenticateManager(
  rawInput: unknown,
  clientIp = "unknown",
): Promise<AuthOutcome> {
  const parsed = managerLoginSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_FAILED" };
  }

  const { email, password } = parsed.data;
  const accountKey = buildManagerAccountKey(email);

  const preCheck = await checkManagerRateLimit({ ip: clientIp, accountKey });
  if (!preCheck.allowed) {
    await recordAuditLog({
      tenantId: null,
      userId: null,
      action: "AUTH_LOGIN_FAILURE",
      entity: "User",
      entityId: accountKey,
      metadata: {
        mode: "manager",
        email,
        ip: clientIp,
        reason: "RATE_LIMITED",
      },
    });
    return {
      ok: false,
      code: "RATE_LIMITED",
      remainingAttempts: 0,
      retryAfterSeconds: preCheck.retryAfterSeconds,
    };
  }

  const user = email.includes("@")
    ? await platformAdminDb.user.findUnique({
        where: { email },
        include: {
          tenant: {
            include: {
              subscription: { select: { status: true } },
            },
          },
        },
      })
    : await platformAdminDb.user.findFirst({
        where: {
          username: email,
          role: { in: ["PLATFORM_ADMIN", "OWNER", "MANAGER"] },
        },
        include: {
          tenant: {
            include: {
              subscription: { select: { status: true } },
            },
          },
        },
      });

  const allowedManagerRole =
    user?.role === "MANAGER" ||
    user?.role === "OWNER" ||
    user?.role === "PLATFORM_ADMIN";

  if (
    !user ||
    !user.active ||
    !allowedManagerRole ||
    !user.passwordHash ||
    !verifySecret(password, user.passwordHash)
  ) {
    await recordManagerFailure({ ip: clientIp, accountKey });
    await recordAuditLog({
      tenantId: user?.tenantId ?? null,
      userId: user?.id ?? null,
      action: "AUTH_LOGIN_FAILURE",
      entity: "User",
      entityId: user?.id ?? email,
      metadata: {
        mode: "manager",
        email,
        ip: clientIp,
      },
    });
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }

  if (user.tenantId && user.tenant?.subscription?.status === "SUSPENDED") {
    await recordAuditLog({
      tenantId: user.tenantId,
      userId: user.id,
      action: "AUTH_LOGIN_FAILURE",
      entity: "User",
      entityId: user.id,
      metadata: {
        mode: "manager",
        email,
        reason: "TENANT_SUSPENDED",
        ip: clientIp,
      },
    });
    return { ok: false, code: "TENANT_SUSPENDED" };
  }

  await resetManagerRateLimit({ ip: clientIp, accountKey });

  await Promise.all([
    recordLastLoginSafely(user.id),
    recordAuditLog({
      tenantId: user.tenantId,
      userId: user.id,
      action: "AUTH_LOGIN_SUCCESS",
      entity: "User",
      entityId: user.id,
      metadata: {
        mode: "manager",
        role: user.role,
        ip: clientIp,
      },
    }),
  ]);

  return {
    ok: true,
    user: {
      userId: user.id,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      locale: user.locale,
    },
  };
}

export async function authenticateStaffPin(
  rawInput: unknown,
  clientIp = "unknown",
): Promise<AuthOutcome> {
  const parsed = staffPinLoginSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_FAILED" };
  }

  const { restaurantCode, username, pin } = parsed.data;
  const accountKey = buildPinAccountKey(restaurantCode, username);

  const preCheck = await checkPinRateLimit({ ip: clientIp, accountKey });
  if (!preCheck.allowed) {
    await recordAuditLog({
      tenantId: null,
      userId: null,
      action: "AUTH_LOGIN_FAILURE",
      entity: "User",
      entityId: accountKey,
      metadata: {
        mode: "staff",
        restaurantCode,
        username,
        ip: clientIp,
        reason: "RATE_LIMITED",
      },
    });
    return {
      ok: false,
      code: "RATE_LIMITED",
      remainingAttempts: 0,
      retryAfterSeconds: preCheck.retryAfterSeconds,
    };
  }

  const restaurant = await platformAdminDb.restaurant.findUnique({
    where: { code: restaurantCode },
    include: {
      subscription: { select: { status: true } },
    },
  });

  const user = restaurant
    ? await platformAdminDb.user.findUnique({
        where: {
          tenantId_username: {
            tenantId: restaurant.id,
            username,
          },
        },
      })
    : null;

  if (
    !restaurant ||
    !user ||
    !user.active ||
    user.role !== "STAFF" ||
    !user.pinHash ||
    !verifySecret(pin, user.pinHash)
  ) {
    const postFail = await recordPinFailure({ ip: clientIp, accountKey });
    await recordAuditLog({
      tenantId: restaurant?.id ?? null,
      userId: user?.id ?? null,
      action: "AUTH_LOGIN_FAILURE",
      entity: "User",
      entityId: user?.id ?? accountKey,
      metadata: {
        mode: "staff",
        restaurantCode,
        username,
        ip: clientIp,
        lockedOut: postFail.lockedOut,
        remainingAttempts: postFail.remainingAttempts,
      },
    });

    if (postFail.lockedOut) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        remainingAttempts: 0,
        retryAfterSeconds: postFail.retryAfterSeconds,
      };
    }

    return {
      ok: false,
      code: "INVALID_PIN",
      remainingAttempts: postFail.remainingAttempts,
    };
  }

  await resetPinRateLimit({ ip: clientIp, accountKey });

  if (restaurant.subscription?.status === "SUSPENDED") {
    await recordAuditLog({
      tenantId: restaurant.id,
      userId: user.id,
      action: "AUTH_LOGIN_FAILURE",
      entity: "User",
      entityId: user.id,
      metadata: {
        mode: "staff",
        restaurantCode,
        username,
        reason: "TENANT_SUSPENDED",
        ip: clientIp,
      },
    });
    return { ok: false, code: "TENANT_SUSPENDED" };
  }

  await Promise.all([
    recordLastLoginSafely(user.id),
    recordAuditLog({
      tenantId: restaurant.id,
      userId: user.id,
      action: "AUTH_LOGIN_SUCCESS",
      entity: "User",
      entityId: user.id,
      metadata: {
        mode: "staff",
        restaurantCode,
        username,
        ip: clientIp,
      },
    }),
  ]);

  return {
    ok: true,
    user: {
      userId: user.id,
      name: user.name,
      role: user.role,
      tenantId: restaurant.id,
      locale: user.locale,
    },
  };
}
