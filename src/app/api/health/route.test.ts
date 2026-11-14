import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateMiddlewareDecision } from "@/lib/authz-rules";

const { queryRawMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  platformAdminDb: {
    $queryRaw: queryRawMock,
  },
}));

import { GET } from "@/app/api/health/route";

describe("/api/health", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("allows unauthenticated requests past auth middleware", () => {
    expect(evaluateMiddlewareDecision("/api/health", null)).toEqual({
      type: "next",
    });
  });

  it("returns 200 with app version and DB status when healthy", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef1234567890");
    vi.stubEnv("VERCEL_REGION", "dxb1");

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");

    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      db: "up",
      commitSha: "abcdef1",
      region: "dxb1",
    });
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
    expect(typeof body.latencyMs).toBe("number");
  });

  it("returns 503 degraded without leaking connection strings or stack traces on DB error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRawMock.mockRejectedValue(
      new Error("connect ECONNREFUSED postgresql://secret:pass@db.internal:5432"),
    );

    const res = await GET();
    expect(res.status).toBe(503);

    const rawText = await res.text();
    expect(rawText).not.toContain("postgresql://");
    expect(rawText).not.toContain("secret:pass");
    expect(rawText).not.toContain("ECONNREFUSED");

    const body = JSON.parse(rawText);
    expect(body).toMatchObject({
      status: "degraded",
      db: "down",
    });
    consoleSpy.mockRestore();
  });
});
