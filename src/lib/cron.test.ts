import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeCronRequest,
  extractCronSecret,
  isCronAuthorized,
  verifyCronSecret,
} from "@/lib/cron";

const {
  runDailyMock,
  runWeeklyMock,
  runMonthlyMock,
  runForecastsMock,
  runInsightsMock,
} = vi.hoisted(() => ({
  runDailyMock: vi.fn(),
  runWeeklyMock: vi.fn(),
  runMonthlyMock: vi.fn(),
  runForecastsMock: vi.fn(),
  runInsightsMock: vi.fn(),
}));

vi.mock("@/features/notifications", () => ({
  runDailyCronJob: runDailyMock,
  runWeeklyCronJob: runWeeklyMock,
  runMonthlyCronJob: runMonthlyMock,
}));

vi.mock("@/features/forecast", () => ({
  runForecastsForAllTenants: runForecastsMock,
}));

vi.mock("@/features/insights", () => ({
  runInsightsForAllTenants: runInsightsMock,
}));

import {
  GET as dailyGet,
  maxDuration as dailyMaxDuration,
  POST as dailyPost,
} from "@/app/api/cron/daily/route";
import {
  GET as weeklyGet,
  maxDuration as weeklyMaxDuration,
  POST as weeklyPost,
} from "@/app/api/cron/weekly/route";
import {
  GET as monthlyGet,
  maxDuration as monthlyMaxDuration,
  POST as monthlyPost,
} from "@/app/api/cron/monthly/route";
import {
  GET as forecastGet,
  maxDuration as forecastMaxDuration,
  POST as forecastPost,
} from "@/app/api/cron/forecast/route";
import {
  GET as insightsGet,
  maxDuration as insightsMaxDuration,
  POST as insightsPost,
} from "@/app/api/cron/insights/route";

const TEST_CRON_SECRET = "pilot-cron-secret-0123456789abcdef";

describe("cron secret extraction & verification", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", TEST_CRON_SECRET);
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("extracts Bearer tokens strictly from Authorization and ignores x-cron-secret", () => {
    const bearerReq = new Request("https://wafrah.test/api/cron/daily", {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    });
    expect(extractCronSecret(bearerReq)).toBe(TEST_CRON_SECRET);

    const legacyHeaderReq = new Request("https://wafrah.test/api/cron/daily", {
      headers: { "x-cron-secret": TEST_CRON_SECRET },
    });
    expect(extractCronSecret(legacyHeaderReq)).toBeNull();

    const basicReq = new Request("https://wafrah.test/api/cron/daily", {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(extractCronSecret(basicReq)).toBeNull();
  });

  it("returns 500 and logs an error when CRON_SECRET is unset or placeholder in production", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    vi.stubEnv("CRON_SECRET", "");
    const unsetAuth = authorizeCronRequest(
      new Request("https://wafrah.test/api/cron/daily"),
    );
    expect(unsetAuth.ok).toBe(false);
    if (!unsetAuth.ok) {
      expect(unsetAuth.response.status).toBe(500);
    }
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "replace-with-cron-secret");

    const req = new Request("https://wafrah.test/api/cron/daily", {
      headers: { authorization: "Bearer replace-with-cron-secret" },
    });
    expect(isCronAuthorized(req)).toBe(false);
    expect(verifyCronSecret(null)).toBe(false);
    const placeholderAuth = authorizeCronRequest(req);
    expect(placeholderAuth.ok).toBe(false);
    if (!placeholderAuth.ok) {
      expect(placeholderAuth.response.status).toBe(500);
    }
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("returns 401 with no details for missing, wrong, or legacy x-cron-secret tokens", async () => {
    const missing = authorizeCronRequest(
      new Request("https://wafrah.test/api/cron/daily"),
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.response.status).toBe(401);
      expect(await missing.response.json()).toEqual({ error: "Unauthorized" });
    }

    const legacy = authorizeCronRequest(
      new Request("https://wafrah.test/api/cron/daily", {
        headers: { "x-cron-secret": TEST_CRON_SECRET },
      }),
    );
    expect(legacy.ok).toBe(false);
    if (!legacy.ok) {
      expect(legacy.response.status).toBe(401);
      expect(await legacy.response.json()).toEqual({ error: "Unauthorized" });
    }
  });
});

describe("cron route handlers (GET & POST)", () => {
  const routes = [
    {
      name: "daily",
      path: "/api/cron/daily",
      GET: dailyGet,
      POST: dailyPost,
      maxDuration: dailyMaxDuration,
    },
    {
      name: "weekly",
      path: "/api/cron/weekly",
      GET: weeklyGet,
      POST: weeklyPost,
      maxDuration: weeklyMaxDuration,
    },
    {
      name: "monthly",
      path: "/api/cron/monthly",
      GET: monthlyGet,
      POST: monthlyPost,
      maxDuration: monthlyMaxDuration,
    },
    {
      name: "forecast",
      path: "/api/cron/forecast",
      GET: forecastGet,
      POST: forecastPost,
      maxDuration: forecastMaxDuration,
    },
    {
      name: "insights",
      path: "/api/cron/insights",
      GET: insightsGet,
      POST: insightsPost,
      maxDuration: insightsMaxDuration,
    },
  ] as const;

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", TEST_CRON_SECRET);
    vi.stubEnv("NODE_ENV", "production");
    runDailyMock.mockResolvedValue({ tenantsSucceeded: 1 });
    runWeeklyMock.mockResolvedValue({ tenantsSucceeded: 1 });
    runMonthlyMock.mockResolvedValue({ tenantsSucceeded: 1 });
    runForecastsMock.mockResolvedValue({ tenantCount: 1 });
    runInsightsMock.mockResolvedValue({ tenantCount: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  for (const route of routes) {
    it(`${route.name} sets maxDuration = 300`, () => {
      expect(route.maxDuration).toBe(300);
    });

    it(`${route.name} rejects unauthenticated, wrong Bearer, and x-cron-secret requests with 401`, async () => {
      const getRes = await route.GET(
        new Request(`https://wafrah.test${route.path}`, { method: "GET" }),
      );
      expect(getRes.status).toBe(401);

      const postRes = await route.POST(
        new Request(`https://wafrah.test${route.path}`, { method: "POST" }),
      );
      expect(postRes.status).toBe(401);

      const legacyHeaderRes = await route.POST(
        new Request(`https://wafrah.test${route.path}`, {
          method: "POST",
          headers: { "x-cron-secret": TEST_CRON_SECRET },
        }),
      );
      expect(legacyHeaderRes.status).toBe(401);

      const wrongBearerRes = await route.GET(
        new Request(`https://wafrah.test${route.path}`, {
          method: "GET",
          headers: { authorization: "Bearer wrong-secret" },
        }),
      );
      expect(wrongBearerRes.status).toBe(401);
    });

    it(`${route.name} returns 500 and never executes when CRON_SECRET is unset`, async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      vi.stubEnv("CRON_SECRET", "");

      const getRes = await route.GET(
        new Request(`https://wafrah.test${route.path}`, { method: "GET" }),
      );
      expect(getRes.status).toBe(500);

      const postRes = await route.POST(
        new Request(`https://wafrah.test${route.path}`, { method: "POST" }),
      );
      expect(postRes.status).toBe(500);
      expect(runDailyMock).not.toHaveBeenCalled();
      expect(runWeeklyMock).not.toHaveBeenCalled();
      expect(runMonthlyMock).not.toHaveBeenCalled();
      expect(runForecastsMock).not.toHaveBeenCalled();
      expect(runInsightsMock).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it(`${route.name} accepts Vercel Cron GET and manual POST with Bearer token`, async () => {
      const getRes = await route.GET(
        new Request(`https://wafrah.test${route.path}`, {
          method: "GET",
          headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
        }),
      );
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.ok).toBe(true);

      const postRes = await route.POST(
        new Request(`https://wafrah.test${route.path}`, {
          method: "POST",
          headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
        }),
      );
      expect(postRes.status).toBe(200);
      const postBody = await postRes.json();
      expect(postBody.ok).toBe(true);
    });

    it(`${route.name} validates query parameters on GET`, async () => {
      const res = await route.GET(
        new Request(`https://wafrah.test${route.path}?now=not-an-iso-date`, {
          method: "GET",
          headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
        }),
      );
      expect(res.status).toBe(400);
    });
  }
});
