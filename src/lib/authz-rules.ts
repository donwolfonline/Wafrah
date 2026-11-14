import type { Role } from "@prisma/client";
import { env } from "@/env";

export type AppAction =
  | "waste.create"
  | "waste.read"
  | "menu.manage"
  | "sales.import"
  | "insights.read"
  | "reports.read"
  | "users.manage"
  | "subscription.manage"
  | "admin.*"
  | `admin.${string}`;

export interface SessionUser {
  userId: string;
  role: Role;
  tenantId: string | null;
  locale: string;
  name?: string | null;
  email?: string | null;
}

const ROLE_ACTIONS: Record<Role, ReadonlySet<string>> = {
  STAFF: new Set(["waste.create", "waste.read"]),
  MANAGER: new Set([
    "waste.create",
    "waste.read",
    "menu.manage",
    "sales.import",
    "insights.read",
    "reports.read",
    "users.manage",
    "subscription.manage",
  ]),
  OWNER: new Set([
    "waste.create",
    "waste.read",
    "menu.manage",
    "sales.import",
    "insights.read",
    "reports.read",
    "users.manage",
    "subscription.manage",
  ]),
  PLATFORM_ADMIN: new Set([
    "admin.*",
    "subscription.manage",
    "users.manage",
    "insights.read",
    "reports.read",
  ]),
};

export const ALL_ROLES: ReadonlySet<string> = new Set([
  "STAFF",
  "MANAGER",
  "OWNER",
  "PLATFORM_ADMIN",
]);

export function can(role: Role | null | undefined, action: AppAction): boolean {
  if (!role) {
    return false;
  }
  const granted = ROLE_ACTIONS[role];
  if (!granted) {
    return false;
  }
  if (action.startsWith("admin.")) {
    return granted.has("admin.*") || granted.has(action);
  }
  return granted.has(action);
}

export function getRoleHomePath(role: Role): "/log" | "/dashboard" | "/admin" {
  switch (role) {
    case "STAFF":
      return "/log";
    case "MANAGER":
    case "OWNER":
      return "/dashboard";
    case "PLATFORM_ADMIN":
      return "/admin";
  }
}

export function canAccessPath(role: Role, pathname: string): boolean {
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  ) {
    return can(role, "admin.*");
  }

  if (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/api/dashboard" ||
    pathname.startsWith("/api/dashboard/")
  ) {
    return (
      (role === "MANAGER" || role === "OWNER") && can(role, "insights.read")
    );
  }

  if (
    pathname === "/menu" ||
    pathname.startsWith("/menu/") ||
    pathname === "/api/menu" ||
    pathname.startsWith("/api/menu/")
  ) {
    return (role === "MANAGER" || role === "OWNER") && can(role, "menu.manage");
  }

  if (
    pathname === "/imports" ||
    pathname.startsWith("/imports/") ||
    pathname === "/api/imports" ||
    pathname.startsWith("/api/imports/")
  ) {
    return (
      (role === "MANAGER" || role === "OWNER") && can(role, "sales.import")
    );
  }

  if (
    pathname === "/reports" ||
    pathname.startsWith("/reports/") ||
    pathname === "/api/reports" ||
    pathname.startsWith("/api/reports/")
  ) {
    return (
      (role === "MANAGER" || role === "OWNER") && can(role, "reports.read")
    );
  }

  if (
    pathname === "/api/staff" ||
    pathname.startsWith("/api/staff/")
  ) {
    return (
      (role === "MANAGER" || role === "OWNER") && can(role, "users.manage")
    );
  }

  if (
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/api/notifications" ||
    pathname.startsWith("/api/notifications/") ||
    pathname === "/api/export" ||
    pathname.startsWith("/api/export/")
  ) {
    return (
      (role === "MANAGER" || role === "OWNER") && can(role, "insights.read")
    );
  }

  if (
    pathname === "/log" ||
    pathname.startsWith("/log/") ||
    pathname === "/api/waste" ||
    pathname.startsWith("/api/waste/") ||
    pathname === "/api/waste-entries" ||
    pathname.startsWith("/api/waste-entries/")
  ) {
    return can(role, "waste.create");
  }

  return true;
}

export type MiddlewareDecision =
  | { type: "next" }
  | { type: "redirect"; destination: string }
  | { type: "json"; status: 401 | 403; error: string };

export const PUBLIC_LOCALE_HEADER = "x-wafrah-public-locale";

export function getPublicRouteLocale(pathname: string): "ar" | "en" | null {
  if (pathname === "/") {
    return "ar";
  }
  if (pathname === "/en") {
    return "en";
  }
  return null;
}

export function evaluateMiddlewareDecision(
  pathname: string,
  role: Role | null,
): MiddlewareDecision {
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/health" ||
    pathname === "/api/health/deep" ||
    pathname === "/api/leads" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/og-ar.png" ||
    pathname === "/og-en.png" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js"
  ) {
    return { type: "next" };
  }

  if (
    env.VERCEL_ENV !== "production" &&
    env.NODE_ENV !== "production" &&
    (pathname === "/design-check" || pathname.startsWith("/design-check/"))
  ) {
    return { type: "next" };
  }

  if (pathname === "/" || pathname === "/en") {
    return { type: "next" };
  }

  const isApiRoute = pathname.startsWith("/api/");

  if (!role) {
    if (
      pathname === "/login" ||
      pathname === "/privacy" ||
      pathname === "/terms" ||
      pathname === "/help" ||
      pathname.startsWith("/help/")
    ) {
      return { type: "next" };
    }
    if (isApiRoute) {
      return { type: "json", status: 401, error: "Unauthenticated" };
    }
    return { type: "redirect", destination: "/login" };
  }

  const homePath = getRoleHomePath(role);

  if (pathname === "/login") {
    return { type: "redirect", destination: homePath };
  }

  if (!canAccessPath(role, pathname)) {
    if (isApiRoute) {
      return { type: "json", status: 403, error: "Forbidden" };
    }
    return { type: "redirect", destination: homePath };
  }

  return { type: "next" };
}

export class AuthorizationError extends Error {
  public readonly statusCode: 401 | 403;

  constructor(message: string, statusCode: 401 | 403) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
  }
}
