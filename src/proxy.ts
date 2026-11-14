import type { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { env } from "@/env";
import { authConfig } from "@/features/auth/config";
import { isProductionRuntime } from "@/lib/app-url";
import {
  evaluateMiddlewareDecision,
  getPublicRouteLocale,
  PUBLIC_LOCALE_HEADER,
} from "@/lib/authz-rules";
import { isVercelProductionEnv } from "@/lib/domain-routing";
import { resolveRequestId } from "@/lib/logger";
import { DISALLOWED_APP_PATH_PREFIXES } from "@/lib/seo";

const { auth } = NextAuth(authConfig);

function isDisallowedIndexPath(pathname: string): boolean {
  return DISALLOWED_APP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function finalizeProxyResponse(
  response: NextResponse,
  requestId: string,
  pathname: string,
): NextResponse {
  response.headers.set("x-request-id", requestId);
  if (!isVercelProductionEnv(env) || isDisallowedIndexPath(pathname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const requestId = resolveRequestId(req.headers);

  if (
    isProductionRuntime() &&
    (pathname === "/design-check" || pathname.startsWith("/design-check/"))
  ) {
    return finalizeProxyResponse(
      new NextResponse("Not Found", { status: 404 }),
      requestId,
      pathname,
    );
  }

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
    return finalizeProxyResponse(response, requestId, pathname);
  }

  if (decision.type === "json") {
    return finalizeProxyResponse(
      NextResponse.json(
        { error: decision.error },
        { status: decision.status },
      ),
      requestId,
      pathname,
    );
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const publicLocale = getPublicRouteLocale(pathname);
  if (publicLocale) {
    requestHeaders.set(PUBLIC_LOCALE_HEADER, publicLocale);
  }

  return finalizeProxyResponse(
    NextResponse.next({
      request: { headers: requestHeaders },
    }),
    requestId,
    pathname,
  );
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
