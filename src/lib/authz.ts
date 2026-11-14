import type { Role } from "@prisma/client";
import {
  ALL_ROLES,
  type AppAction,
  AuthorizationError,
  can,
  canAccessPath,
  evaluateMiddlewareDecision,
  getRoleHomePath,
  type MiddlewareDecision,
  type SessionUser,
} from "./authz-rules";

export {
  type AppAction,
  AuthorizationError,
  can,
  canAccessPath,
  evaluateMiddlewareDecision,
  getRoleHomePath,
  type MiddlewareDecision,
  type SessionUser,
};

function isRole(value: string): value is Role {
  return ALL_ROLES.has(value);
}

export async function requireRole(
  requirement: Role | readonly Role[] | AppAction,
  sessionUserOverride?: SessionUser | null,
): Promise<SessionUser> {
  let user = sessionUserOverride;
  if (user === undefined) {
    const { getServerSessionUser } = await import("@/features/auth/session");
    user = await getServerSessionUser();
  }

  if (!user || !user.userId || !user.role) {
    throw new AuthorizationError("Unauthenticated", 401);
  }

  if (Array.isArray(requirement)) {
    const allowedRoles = requirement as readonly Role[];
    const matchesDirect = allowedRoles.includes(user.role);
    const matchesOwnerAsManager =
      user.role === "OWNER" && allowedRoles.includes("MANAGER");
    if (!matchesDirect && !matchesOwnerAsManager) {
      throw new AuthorizationError(
        `Role ${user.role} is not permitted for this resource`,
        403,
      );
    }
    return user;
  }

  const singleReq = requirement as string;
  if (isRole(singleReq)) {
    const matchesDirect = user.role === singleReq;
    const matchesOwnerAsManager =
      user.role === "OWNER" && singleReq === "MANAGER";
    if (!matchesDirect && !matchesOwnerAsManager) {
      throw new AuthorizationError(
        `Role ${user.role} is not permitted; required ${singleReq}`,
        403,
      );
    }
    return user;
  }

  if (!can(user.role, singleReq as AppAction)) {
    throw new AuthorizationError(
      `Role ${user.role} is not permitted to perform ${singleReq}`,
      403,
    );
  }

  return user;
}
