import { describe, expect, it, vi } from "vitest";
import { GET as adminRootGet } from "@/app/api/admin/route";
import { GET as adminOverviewGet } from "@/app/api/admin/overview/route";
import { POST as adminRestaurantsPost } from "@/app/api/admin/restaurants/route";
import { GET as adminDiagnosticsGet } from "@/app/api/admin/restaurants/[id]/diagnostics/route";
import { PATCH as adminSubscriptionPatch } from "@/app/api/admin/restaurants/[id]/subscription/route";
import { POST as adminSuspendPost } from "@/app/api/admin/restaurants/[id]/suspend/route";
import { evaluateMiddlewareDecision, type SessionUser } from "@/lib/authz";

const { getServerSessionUserMock } = vi.hoisted(() => ({
  getServerSessionUserMock: vi.fn<() => Promise<SessionUser | null>>(),
}));

vi.mock("@/features/auth/session", () => ({
  getServerSessionUser: getServerSessionUserMock,
}));

const STAFF_SESSION: SessionUser = {
  userId: "user-staff-1",
  name: "Staff",
  role: "STAFF",
  tenantId: "tenant-1",
  locale: "ar",
};

const MANAGER_SESSION: SessionUser = {
  userId: "user-mgr-1",
  name: "Manager",
  role: "MANAGER",
  tenantId: "tenant-1",
  locale: "ar",
};

const OWNER_SESSION: SessionUser = {
  userId: "user-owner-1",
  name: "Owner",
  role: "OWNER",
  tenantId: "tenant-1",
  locale: "en",
};

describe("admin RBAC & route protection", () => {
  it("blocks non-admin roles from all /admin and /api/admin paths in middleware", () => {
    const adminPages = ["/admin", "/admin/health", "/admin/restaurants/123"];
    const adminApis = [
      "/api/admin",
      "/api/admin/overview",
      "/api/admin/restaurants",
      "/api/admin/restaurants/123/subscription",
      "/api/admin/restaurants/123/suspend",
      "/api/admin/restaurants/123/diagnostics",
    ];

    for (const path of adminPages) {
      expect(evaluateMiddlewareDecision(path, null)).toEqual({
        type: "redirect",
        destination: "/login",
      });
      expect(evaluateMiddlewareDecision(path, "STAFF")).toEqual({
        type: "redirect",
        destination: "/log",
      });
      expect(evaluateMiddlewareDecision(path, "MANAGER")).toEqual({
        type: "redirect",
        destination: "/dashboard",
      });
      expect(evaluateMiddlewareDecision(path, "OWNER")).toEqual({
        type: "redirect",
        destination: "/dashboard",
      });
      expect(evaluateMiddlewareDecision(path, "PLATFORM_ADMIN")).toEqual({
        type: "next",
      });
    }

    for (const apiPath of adminApis) {
      expect(evaluateMiddlewareDecision(apiPath, null)).toEqual({
        type: "json",
        status: 401,
        error: "Unauthenticated",
      });
      for (const nonAdminRole of ["STAFF", "MANAGER", "OWNER"] as const) {
        expect(evaluateMiddlewareDecision(apiPath, nonAdminRole)).toEqual({
          type: "json",
          status: 403,
          error: "Forbidden",
        });
      }
      expect(evaluateMiddlewareDecision(apiPath, "PLATFORM_ADMIN")).toEqual({
        type: "next",
      });
    }
  });

  it("returns 401 for unauthenticated requests and 403 for STAFF, MANAGER, and OWNER across every /api/admin handler", async () => {
    const cases: Array<{ session: SessionUser | null; expectedStatus: number }> =
      [
        { session: null, expectedStatus: 401 },
        { session: STAFF_SESSION, expectedStatus: 403 },
        { session: MANAGER_SESSION, expectedStatus: 403 },
        { session: OWNER_SESSION, expectedStatus: 403 },
      ];

    for (const testCase of cases) {
      getServerSessionUserMock.mockResolvedValue(testCase.session);

      const rootRes = await adminRootGet();
      expect(rootRes.status).toBe(testCase.expectedStatus);

      const overviewRes = await adminOverviewGet();
      expect(overviewRes.status).toBe(testCase.expectedStatus);

      const createRes = await adminRestaurantsPost(
        new Request("http://localhost:3000/api/admin/restaurants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(createRes.status).toBe(testCase.expectedStatus);

      const subRes = await adminSubscriptionPatch(
        new Request(
          "http://localhost:3000/api/admin/restaurants/tenant-1/subscription",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan: "MEDIUM", status: "ACTIVE" }),
          },
        ),
        { params: Promise.resolve({ id: "tenant-1" }) },
      );
      expect(subRes.status).toBe(testCase.expectedStatus);

      const suspendRes = await adminSuspendPost(
        new Request(
          "http://localhost:3000/api/admin/restaurants/tenant-1/suspend",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "suspend" }),
          },
        ),
        { params: Promise.resolve({ id: "tenant-1" }) },
      );
      expect(suspendRes.status).toBe(testCase.expectedStatus);

      const diagRes = await adminDiagnosticsGet(
        new Request(
          "http://localhost:3000/api/admin/restaurants/tenant-1/diagnostics",
        ),
        { params: Promise.resolve({ id: "tenant-1" }) },
      );
      expect(diagRes.status).toBe(testCase.expectedStatus);
    }
  });
});
