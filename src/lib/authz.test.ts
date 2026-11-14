import { describe, expect, it } from "vitest";
import {
  handleAdminGet,
  handleDashboardGet,
} from "@/features/auth/protected-routes";
import { managerLoginSchema } from "@/features/auth/schemas";
import {
  AuthorizationError,
  can,
  canAccessPath,
  evaluateMiddlewareDecision,
  getRoleHomePath,
  requireRole,
  type SessionUser,
} from "@/lib/authz";

const staffSession: SessionUser = {
  userId: "staff-1",
  name: "Ahmed Al-Harbi",
  role: "STAFF",
  tenantId: "tenant-jeddah",
  locale: "ar",
};

const managerSession: SessionUser = {
  userId: "manager-1",
  name: "Tariq Al-Shami",
  role: "MANAGER",
  tenantId: "tenant-jeddah",
  locale: "ar",
};

describe("RBAC permissions and route/API protection", () => {
  it("grants STAFF only waste.create and waste.read", () => {
    expect(can("STAFF", "waste.create")).toBe(true);
    expect(can("STAFF", "waste.read")).toBe(true);
    expect(can("STAFF", "menu.manage")).toBe(false);
    expect(can("STAFF", "sales.import")).toBe(false);
    expect(can("STAFF", "insights.read")).toBe(false);
    expect(can("STAFF", "reports.read")).toBe(false);
    expect(can("STAFF", "users.manage")).toBe(false);
    expect(can("STAFF", "subscription.manage")).toBe(false);
    expect(can("STAFF", "admin.*")).toBe(false);
  });

  it("grants MANAGER and OWNER restaurant management actions but not admin.*", () => {
    for (const role of ["MANAGER", "OWNER"] as const) {
      expect(can(role, "waste.create")).toBe(true);
      expect(can(role, "waste.read")).toBe(true);
      expect(can(role, "menu.manage")).toBe(true);
      expect(can(role, "sales.import")).toBe(true);
      expect(can(role, "insights.read")).toBe(true);
      expect(can(role, "reports.read")).toBe(true);
      expect(can(role, "users.manage")).toBe(true);
      expect(can(role, "subscription.manage")).toBe(true);
      expect(can(role, "admin.*")).toBe(false);
    }
  });

  it("grants PLATFORM_ADMIN admin.* access", () => {
    expect(can("PLATFORM_ADMIN", "admin.*")).toBe(true);
    expect(getRoleHomePath("PLATFORM_ADMIN")).toBe("/admin");
  });

  it("blocks STAFF from dashboard and admin routes in middleware and path checks", () => {
    expect(canAccessPath("STAFF", "/log")).toBe(true);
    expect(canAccessPath("STAFF", "/dashboard")).toBe(false);
    expect(canAccessPath("STAFF", "/reports")).toBe(false);
    expect(canAccessPath("STAFF", "/settings/notifications")).toBe(false);
    expect(canAccessPath("STAFF", "/admin")).toBe(false);
    expect(canAccessPath("STAFF", "/api/dashboard")).toBe(false);
    expect(canAccessPath("STAFF", "/api/reports/baseline")).toBe(false);
    expect(canAccessPath("STAFF", "/api/notifications/preferences")).toBe(
      false,
    );
    expect(canAccessPath("STAFF", "/api/admin")).toBe(false);
    expect(canAccessPath("MANAGER", "/api/reports/baseline")).toBe(true);
    expect(canAccessPath("MANAGER", "/settings/notifications")).toBe(true);
    expect(canAccessPath("MANAGER", "/api/notifications/preferences")).toBe(
      true,
    );
    expect(canAccessPath("OWNER", "/settings/notifications")).toBe(true);
    expect(canAccessPath("OWNER", "/api/notifications/preferences")).toBe(true);
    expect(canAccessPath("PLATFORM_ADMIN", "/api/reports/baseline")).toBe(false);
    expect(canAccessPath("PLATFORM_ADMIN", "/settings/notifications")).toBe(
      false,
    );
    expect(
      canAccessPath("PLATFORM_ADMIN", "/api/notifications/preferences"),
    ).toBe(false);

    expect(evaluateMiddlewareDecision("/dashboard", "STAFF")).toEqual({
      type: "redirect",
      destination: "/log",
    });
    expect(evaluateMiddlewareDecision("/admin", "STAFF")).toEqual({
      type: "redirect",
      destination: "/log",
    });
    expect(evaluateMiddlewareDecision("/api/dashboard", "STAFF")).toEqual({
      type: "json",
      status: 403,
      error: "Forbidden",
    });
    expect(evaluateMiddlewareDecision("/api/admin", "STAFF")).toEqual({
      type: "json",
      status: 403,
      error: "Forbidden",
    });
  });

  it("redirects unauthenticated users to /login and routes each role to its home", () => {
    expect(evaluateMiddlewareDecision("/dashboard", null)).toEqual({
      type: "redirect",
      destination: "/login",
    });
    expect(evaluateMiddlewareDecision("/api/dashboard", null)).toEqual({
      type: "json",
      status: 401,
      error: "Unauthenticated",
    });
    expect(evaluateMiddlewareDecision("/login", "STAFF")).toEqual({
      type: "redirect",
      destination: "/log",
    });
    expect(evaluateMiddlewareDecision("/login", "MANAGER")).toEqual({
      type: "redirect",
      destination: "/dashboard",
    });
    expect(evaluateMiddlewareDecision("/login", "OWNER")).toEqual({
      type: "redirect",
      destination: "/dashboard",
    });
    expect(evaluateMiddlewareDecision("/login", "PLATFORM_ADMIN")).toEqual({
      type: "redirect",
      destination: "/admin",
    });
  });

  it("rejects STAFF when calling requireRole or dashboard/admin API handlers directly", async () => {
    await expect(requireRole("insights.read", staffSession)).rejects.toThrow(
      AuthorizationError,
    );

    await expect(requireRole("admin.*", managerSession)).rejects.toThrow(
      AuthorizationError,
    );

    const dashboardRes = await handleDashboardGet(staffSession);
    expect(dashboardRes.status).toBe(403);

    const adminResFromStaff = await handleAdminGet(staffSession);
    expect(adminResFromStaff.status).toBe(403);

    const adminResFromManager = await handleAdminGet(managerSession);
    expect(adminResFromManager.status).toBe(403);
  });

  it("trims copy-paste whitespace/tabs and accepts email or username in managerLoginSchema", () => {
    const emailParsed = managerLoginSchema.parse({
      email: "  admin@wafrah.sa\t",
      password: "  WafrahAdmin!2026\t",
    });
    expect(emailParsed).toEqual({
      email: "admin@wafrah.sa",
      password: "WafrahAdmin!2026",
    });

    const usernameParsed = managerLoginSchema.parse({
      email: "platform-admin",
      password: "WafrahAdmin!2026",
    });
    expect(usernameParsed).toEqual({
      email: "platform-admin",
      password: "WafrahAdmin!2026",
    });
  });

  it("allows unauthenticated POST endpoint /api/leads while keeping /api/admin/leads* PLATFORM_ADMIN only", () => {
    expect(evaluateMiddlewareDecision("/api/leads", null)).toEqual({ type: "next" });
    expect(evaluateMiddlewareDecision("/api/admin/leads", null)).toEqual({
      type: "json",
      status: 401,
      error: "Unauthenticated",
    });
    expect(evaluateMiddlewareDecision("/api/admin/leads/export", "STAFF")).toEqual({
      type: "json",
      status: 403,
      error: "Forbidden",
    });
    expect(evaluateMiddlewareDecision("/api/admin/leads/lead-1", "MANAGER")).toEqual({
      type: "json",
      status: 403,
      error: "Forbidden",
    });
    expect(evaluateMiddlewareDecision("/api/admin/leads", "OWNER")).toEqual({
      type: "json",
      status: 403,
      error: "Forbidden",
    });
    expect(evaluateMiddlewareDecision("/api/admin/leads", "PLATFORM_ADMIN")).toEqual({
      type: "next",
    });
  });
});
