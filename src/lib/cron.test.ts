import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
  POST as dailyPost,
} from "@/app/api/cron/daily/route";
import {
  GET as weeklyGet,
  POST as weeklyPost,
} from "@/app/api/cron/weekly/route";
import {
  GET as monthlyGet,
  POST as monthlyPost,
} from "@/app/api/cron/monthly/route";
import {
  GET as forecastGet,
  POST as forecastPost,
} from "@/app/api/cron/forecast/route";
import {
  GET as insightsGet,
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
  });

  it("extracts Bearer tokens from Authorization and falls back to x-cron-secret", () => {
    const bearerReq = new Request("https://wafrah.test/api/cron/daily", {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    });
    expect(extractCronSecret(bearerReq)).toBe(TEST_CRON_SECRET);

    const headerReq = new Request("https://wafrah.test/api/cron/daily", {
      headers: { "x-cron-secret": TEST_CRON_SECRET },
    });
    expect(extractCronSecret(headerReq)).toBe(TEST_CRON_SECRET);

    const basicReq = new Request("https://wafrah.test/api/cron/daily", {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(extractCronSecret(basicReq)).toBeNull();
  });

  it("rejects empty or placeholder CRON_SECRET in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "replace-with-cron-secret");

    const req = new Request("https://wafrah.test/api/cron/daily", {
      headers: { authorization: "Bearer replace-with-cron-secret" },
    });
    expect(isCronAuthorized(req)).toBe(false);
    expect(verifyCronSecret(null)).toBe(false);
  });
});

describe("cron route handlers (GET & POST)", () => {
  const routes = [
    { name: "daily", path: "/api/cron/daily", GET: dailyGet, POST: dailyPost },
    {
      name: "weekly",
      path: "/api/cron/weekly",
      GET: weeklyGet,
      POST: weeklyPost,
    },
    {
      name: "monthly",
      path: "/api/cron/monthly",
      GET: monthlyGet,
      POST: monthlyPost,
    },
    {
      name: "forecast",
      path: "/api/cron/forecast",
      GET: forecastGet,
      POST: forecastPost,
    },
    {
      name: "insights",
      path: "/api/cron/insights",
      GET: insightsGet,
      POST: insightsPost,
    },
  ] as const;

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", TEST_CRON_SECRET);
    vi.stubEnv("NODE_ENV", "production");
    runDailyMock.mockResolvedValue({ tenantsProcessed: 1 });
    runWeeklyMock.mockResolvedValue({ tenantsProcessed: 1 });
    runMonthlyMock.mockResolvedValue({ tenantsProcessed: 1 });
    runForecastsMock.mockResolvedValue({ tenantsProcessed: 1 });
    runInsightsMock.mockResolvedValue({ tenantsProcessed: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  for (const route of routes) {
    it(`${route.name} rejects unauthenticated GET and POST requests with 401`, async () => {
      const getRes = await route.GET(
        new Request(`https://wafrah.test${route.path}`, { method: "GET" }),
      );
      expect(getRes.status).toBe(401);

      const postRes = await route.POST(
        new Request(`https://wafrah.test${route.path}`, { method: "POST" }),
      );
      expect(postRes.status).toBe(401);

      const wrongBearerRes = await route.GET(
        new Request(`https://wafrah.test${route.path}`, {
          method: "GET",
          headers: { authorization: "Bearer wrong-secret" },
        }),
      );
      expect(wrongBearerRes.status).toBe(401);
    });

    it(`${route.name} accepts Vercel Cron GET with Bearer token`, async () => {
      const res = await route.GET(
        new Request(`https://wafrah.test${route.path}`, {
          method: "GET",
          headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
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
