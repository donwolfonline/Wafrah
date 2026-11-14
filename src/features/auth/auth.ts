import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateManager, authenticateStaffPin } from "./authorize";
import { authConfig } from "./config";

export class RateLimitedSigninError extends CredentialsSignin {
  override code = "RATE_LIMITED";
}

export class InvalidPinSigninError extends CredentialsSignin {
  override code = "INVALID_PIN";
}

export class TenantSuspendedSigninError extends CredentialsSignin {
  override code = "TENANT_SUSPENDED";
}

function extractClientIp(request?: Request): string {
  if (!request) {
    return "127.0.0.1";
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "127.0.0.1";
  }
  return request.headers.get("x-real-ip") || "127.0.0.1";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "credentials",
      name: "Credentials",
      credentials: {
        mode: { label: "Mode", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        restaurantCode: { label: "Restaurant Code", type: "text" },
        username: { label: "Username", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials, request) {
        const clientIp = extractClientIp(request);
        const mode =
          typeof credentials?.mode === "string" ? credentials.mode : "manager";

        if (mode === "staff") {
          const outcome = await authenticateStaffPin(credentials, clientIp);
          if (!outcome.ok) {
            if (outcome.code === "RATE_LIMITED") {
              throw new RateLimitedSigninError();
            }
            if (outcome.code === "TENANT_SUSPENDED") {
              throw new TenantSuspendedSigninError();
            }
            throw new InvalidPinSigninError();
          }
          return {
            id: outcome.user.userId,
            userId: outcome.user.userId,
            name: outcome.user.name,
            role: outcome.user.role,
            tenantId: outcome.user.tenantId,
            locale: outcome.user.locale,
          };
        }

        const outcome = await authenticateManager(credentials, clientIp);
        if (!outcome.ok) {
          if (outcome.code === "RATE_LIMITED") {
            throw new RateLimitedSigninError();
          }
          if (outcome.code === "TENANT_SUSPENDED") {
            throw new TenantSuspendedSigninError();
          }
          return null;
        }
        return {
          id: outcome.user.userId,
          userId: outcome.user.userId,
          name: outcome.user.name,
          role: outcome.user.role,
          tenantId: outcome.user.tenantId,
          locale: outcome.user.locale,
        };
      },
    }),
  ],
});
