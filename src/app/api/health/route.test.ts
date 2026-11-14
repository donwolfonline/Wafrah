import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { evaluateMiddlewareDecision } from "@/lib/authz-rules";

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

  it("returns 200 with status, version, and time only (no internals)", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef1234567890");
    vi.stubEnv("VERCEL_REGION", "fra1");

    const res = await GET(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");

    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["status", "time", "version"]);
    expect(body.status).toBe("ok");
    expect(typeof body.version).toBe("string");
    expect((body.version as string).length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(String(body.time)))).toBe(false);
    expect(body).not.toHaveProperty("db");
    expect(body).not.toHaveProperty("commitSha");
    expect(body).not.toHaveProperty("region");
    expect(body).not.toHaveProperty("latencyMs");
  });
});
