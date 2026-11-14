import type { Role } from "@prisma/client";
import type { NextAuthConfig } from "next-auth";
import { decode, encode } from "next-auth/jwt";
import {
  applyJwtSessionPolicy,
  getTokenEncodeMaxAge,
  MANAGER_SESSION_MAX_AGE_SECONDS,
  shouldUseSecureCookies,
} from "./session-policy";

declare module "next-auth" {
  interface User {
    userId: string;
    role: Role;
    tenantId: string | null;
    locale: string;
  }

  interface Session {
    user: {
      id: string;
      userId: string;
      name: string;
      email?: string | null;
      role: Role;
      tenantId: string | null;
      locale: string;
    };
  }
}

const useSecureCookies = shouldUseSecureCookies();
const securePrefix = useSecureCookies ? "__Secure-" : "";
const hostPrefix = useSecureCookies ? "__Host-" : "";

export const SESSION_COOKIE_NAME = `${securePrefix}authjs.session-token`;

const baseCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: useSecureCookies,
};

export const authConfig: NextAuthConfig = {
  useSecureCookies,
  ...(!useSecureCookies ? { trustHost: true } : {}),
  session: {
    strategy: "jwt",
    // Ceiling lifetime for managers/owners/admins (sliding refresh enforced in jwt callback).
    // Staff sessions are capped to 12 hours fixed in applyJwtSessionPolicy.
    maxAge: MANAGER_SESSION_MAX_AGE_SECONDS,
    updateAge: 60,
  },
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: baseCookieOptions,
    },
    callbackUrl: {
      name: `${securePrefix}authjs.callback-url`,
      options: baseCookieOptions,
    },
    csrfToken: {
      name: `${hostPrefix}authjs.csrf-token`,
      options: baseCookieOptions,
    },
  },
  jwt: {
    maxAge: MANAGER_SESSION_MAX_AGE_SECONDS,
    async encode(params) {
      const cappedMaxAge = getTokenEncodeMaxAge(
        params.token as Record<string, unknown> | undefined,
      );
      return encode({
        ...params,
        maxAge: params.maxAge ? Math.min(params.maxAge, cappedMaxAge) : cappedMaxAge,
      });
    },
    async decode(params) {
      return decode(params);
    },
  },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      return applyJwtSessionPolicy(token, user);
    },
    async session({ session, token }) {
      if (!token) {
        return session;
      }
      if (session.user) {
        const userId =
          typeof token.userId === "string" ? token.userId : (token.sub ?? "");
        session.user.id = userId;
        session.user.userId = userId;
        session.user.name =
          typeof token.name === "string" ? token.name : "User";
        session.user.role = (token.role as Role) ?? "STAFF";
        session.user.tenantId =
          typeof token.tenantId === "string" ? token.tenantId : null;
        session.user.locale =
          typeof token.locale === "string" ? token.locale : "ar";
      }
      if (typeof token.sessionExpiresAt === "number") {
        (session as { expires?: string }).expires = new Date(
          token.sessionExpiresAt * 1000,
        ).toISOString();
      }
      return session;
    },
  },
};
