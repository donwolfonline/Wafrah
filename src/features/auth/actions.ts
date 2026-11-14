"use server";

import { cookies } from "next/headers";
import { AuthError } from "next-auth";
import { z } from "zod";
import { recordAuditLog } from "@/lib/audit";
import { getRoleHomePath } from "@/lib/authz-rules";
import { platformAdminDb } from "@/lib/db";
import { signIn, signOut } from "./auth";
import { SESSION_COOKIE_NAME } from "./config";
import { managerLoginSchema, staffPinLoginSchema } from "./schemas";
import { getServerSessionUser } from "./session";
import {
  shouldUseSecureCookies,
  STAFF_SESSION_MAX_AGE_SECONDS,
} from "./session-policy";

export type LoginActionResult =
  | { ok: true; redirectTo: "/log" | "/dashboard" | "/admin" }
  | {
      ok: false;
      errorKey:
        | "invalidCredentials"
        | "invalidPin"
        | "rateLimited"
        | "tenantSuspended"
        | "validationFailed";
    };

const logoutModeSchema = z.enum(["standard", "switch-staff"]).default("standard");

async function capStaffSessionCookieLifetime(): Promise<void> {
  const cookieStore = await cookies();
  const useSecure = shouldUseSecureCookies();
  for (const cookie of cookieStore.getAll()) {
    if (
      cookie.name === SESSION_COOKIE_NAME ||
      cookie.name.startsWith(`${SESSION_COOKIE_NAME}.`)
    ) {
      cookieStore.set(cookie.name, cookie.value, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecure,
        maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
      });
    }
  }
}

export async function loginManagerAction(
  rawInput: unknown,
): Promise<LoginActionResult> {
  const parsed = managerLoginSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, errorKey: "validationFailed" };
  }

  try {
    await signIn("credentials", {
      mode: "manager",
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });

    const identifier = parsed.data.email;
    const dbUser = identifier.includes("@")
      ? await platformAdminDb.user.findUnique({
          where: { email: identifier },
          select: { role: true },
        })
      : await platformAdminDb.user.findFirst({
          where: {
            username: identifier,
            role: { in: ["PLATFORM_ADMIN", "OWNER", "MANAGER"] },
          },
          select: { role: true },
        });

    const redirectTo = dbUser ? getRoleHomePath(dbUser.role) : "/dashboard";
    return { ok: true, redirectTo };
  } catch (error) {
    if (error instanceof AuthError) {
      const code = (error as AuthError & { code?: string }).code;
      if (code === "RATE_LIMITED") {
        return { ok: false, errorKey: "rateLimited" };
      }
      if (code === "TENANT_SUSPENDED") {
        return { ok: false, errorKey: "tenantSuspended" };
      }
      return { ok: false, errorKey: "invalidCredentials" };
    }
    throw error;
  }
}

export async function loginStaffAction(
  rawInput: unknown,
): Promise<LoginActionResult> {
  const parsed = staffPinLoginSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, errorKey: "validationFailed" };
  }

  try {
    await signIn("credentials", {
      mode: "staff",
      restaurantCode: parsed.data.restaurantCode,
      username: parsed.data.username,
      pin: parsed.data.pin,
      redirect: false,
    });
    await capStaffSessionCookieLifetime();
    return { ok: true, redirectTo: "/log" };
  } catch (error) {
    if (error instanceof AuthError) {
      const code = (error as AuthError & { code?: string }).code;
      if (code === "RATE_LIMITED") {
        return { ok: false, errorKey: "rateLimited" };
      }
      if (code === "TENANT_SUSPENDED") {
        return { ok: false, errorKey: "tenantSuspended" };
      }
      return { ok: false, errorKey: "invalidPin" };
    }
    throw error;
  }
}

export async function logoutAction(formData?: FormData): Promise<void> {
  const user = await getServerSessionUser();
  const rawMode = formData?.get("mode");
  const modeResult = logoutModeSchema.safeParse(
    typeof rawMode === "string" ? rawMode : "standard",
  );
  const mode = modeResult.success ? modeResult.data : "standard";
  const redirectTo = mode === "switch-staff" ? "/login?tab=staff" : "/login";

  if (user) {
    await recordAuditLog({
      tenantId: user.tenantId,
      userId: user.userId,
      action: "AUTH_LOGOUT",
      entity: "User",
      entityId: user.userId,
      metadata: {
        role: user.role,
        switchUser: mode === "switch-staff",
      },
    });
  }

  await signOut({ redirectTo });
}
