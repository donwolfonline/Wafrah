import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateMiddlewareDecision } from "@/lib/authz-rules";

const { queryRawMock, findManyAuditLogMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
  findManyAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  platformAdminDb: {
    $queryRaw: queryRawMock,
    auditLog: {
      findMany: findManyAuditLogMock,
    },
  },
}));

import { GET } from "@/app/api/health/deep/route";

const TEST_CRON_SECRET = "deep-health-cron-secret-0123456789";

describe("/api/health/deep", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", TEST_CRON_SECRET);
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("bypasses NextAuth session middleware so route Bearer gate runs directly", () => {
    expect(evaluateMiddlewareDecision("/api/health/deep", null)).toEqual({
      type: "next",
    });
  });

  it("returns 500 when CRON_SECRET is unset", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("CRON_SECRET", "");

    const res = await GET(new Request("http://localhost/api/health/deep"));
    expect(res.status).toBe(500);
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("returns 401 when Bearer token is missing, wrong, or sent as x-cron-secret", async () => {
    const missing = await GET(new Request("http://localhost/api/health/deep"));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "Unauthorized" });

    const wrong = await GET(
      new Request("http://localhost/api/health/deep", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(wrong.status).toBe(401);

    const legacy = await GET(
      new Request("http://localhost/api/health/deep", {
        headers: { "x-cron-secret": TEST_CRON_SECRET },
      }),
    );
    expect(legacy.status).toBe(401);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("returns 200 when DB is reachable and daily cron completed within threshold", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    findManyAuditLogMock.mockResolvedValue([
      {
        createdAt: new Date(Date.now() - 30 * 60_000),
        metadata: { tenantCount: 2, tenantsSucceeded: 2, tenantsFailed: 0 },
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/health/deep", {
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store, max-age=0");

    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      checks: {
        db: { status: "up" },
        cron: { status: "ok", action: "CRON_DAILY_COMPLETED" },
      },
    });
  });

  it("returns 503 when no cron AuditLog exists, cron is stale, or DB fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // 1. Missing AuditLog
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    findManyAuditLogMock.mockResolvedValue([]);
    const missingCronRes = await GET(
      new Request("http://localhost/api/health/deep", {
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      }),
    );
    expect(missingCronRes.status).toBe(503);
    const missingBody = await missingCronRes.json();
    expect(missingBody.status).toBe("unhealthy");
    expect(missingBody.checks.cron.status).toBe("missing");

    // 2. Stale cron (> 26h old)
    findManyAuditLogMock.mockResolvedValue([
      {
        createdAt: new Date(Date.now() - 30 * 60 * 60_000),
        metadata: { tenantCount: 1, tenantsSucceeded: 1, tenantsFailed: 0 },
      },
    ]);
    const staleCronRes = await GET(
      new Request("http://localhost/api/health/deep", {
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      }),
    );
    expect(staleCronRes.status).toBe(503);
    expect((await staleCronRes.json()).checks.cron.status).toBe("stale");

    // 3. DB error without leaking secrets
    queryRawMock.mockRejectedValue(
      new Error("connect ECONNREFUSED postgresql://secret:pass@db.internal:5432"),
    );
    const dbErrRes = await GET(
      new Request("http://localhost/api/health/deep", {
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      }),
    );
    expect(dbErrRes.status).toBe(503);
    const raw = await dbErrRes.text();
    expect(raw).not.toContain("postgresql://");
    expect(raw).not.toContain("secret:pass");
    expect(JSON.parse(raw).checks.db.status).toBe("down");
  });
});
