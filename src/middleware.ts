import type { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/features/auth/config";
import {
  evaluateMiddlewareDecision,
  getPublicRouteLocale,
  PUBLIC_LOCALE_HEADER,
} from "@/lib/authz-rules";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  // Fail closed when Auth.js attaches an error payload instead of throwing
  // (mitigates GHSA-8fpg-xm3f-6cx3).
  const authPayload = req.auth as {
    error?: unknown;
    user?: { role?: Role; userId?: string };
  } | null;
  const hasValidAuth =
    Boolean(authPayload) &&
    !authPayload?.error &&
    Boolean(authPayload?.user?.role) &&
    Boolean(authPayload?.user?.userId);
  const role = hasValidAuth ? (authPayload?.user?.role ?? null) : null;
  const decision = evaluateMiddlewareDecision(pathname, role);

  if (decision.type === "redirect") {
    const hasStaleSessionCookie =
      !hasValidAuth &&
      (req.cookies.has("authjs.session-token") ||
        req.cookies.has("__Secure-authjs.session-token"));

    const destination =
      decision.destination === "/login" && hasStaleSessionCookie
        ? "/login?reason=expired"
        : decision.destination;

    const response = NextResponse.redirect(new URL(destination, req.nextUrl));
    if (hasStaleSessionCookie) {
      response.cookies.delete("authjs.session-token");
      response.cookies.delete("__Secure-authjs.session-token");
    }
    return response;
  }

  if (decision.type === "json") {
    return NextResponse.json(
      { error: decision.error },
      { status: decision.status },
    );
  }

  const publicLocale = getPublicRouteLocale(pathname);
  if (publicLocale) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(PUBLIC_LOCALE_HEADER, publicLocale);
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
