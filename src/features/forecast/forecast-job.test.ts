import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { POST as cronForecastPost } from "@/app/api/cron/forecast/route";
import { runForecastsForTenant } from "@/features/forecast";
import { evaluateMiddlewareDecision } from "@/lib/authz";
import { createTenantDb, platformAdminDb } from "@/lib/tenant";

describe("Forecast job, persistence, accuracy audit, and cron endpoint", () => {
  it("persists 7-day forecasts for seeded tenants, stays idempotent on reruns, and preserves tenant isolation", async () => {
    const shamiJed = await platformAdminDb.restaurant.findUniqueOrThrow({
      where: { code: "SHAMI-JED" },
      select: { id: true },
    });
    const diwanMkh = await platformAdminDb.restaurant.findUniqueOrThrow({
      where: { code: "DIWAN-MKH" },
      select: { id: true },
    });

    const shamiDb = createTenantDb(shamiJed.id);
    const diwanDb = createTenantDb(diwanMkh.id);
    const evalDate = new Date("2026-11-13T11:00:00.000Z"); // 14:00 Asia/Riyadh

    const shamiRice = await shamiDb.menuItem.findFirstOrThrow({
      where: { code: "SHM-RICE" },
      select: { id: true },
    });

    const pastDateUtc = new Date("2026-11-11T00:00:00.000Z");
    let createdPastId: string | null = null;

    try {
      // Seed one past forecast row to exercise historical WAPE scoring & preservation
      await shamiDb.forecastResult.deleteMany({
        where: { menuItemId: shamiRice.id, forDate: pastDateUtc },
      });
      const pastRow = await shamiDb.forecastResult.create({
        data: {
          tenantId: shamiJed.id,
          menuItemId: shamiRice.id,
          forDate: pastDateUtc,
          meanQty: "100",
          lowQty: "85",
          highQty: "115",
          recommendedQty: "104",
          method: "TEST_PAST_SEED",
          inputsSnapshot: { test: true },
        },
        select: { id: true },
      });
      createdPastId = pastRow.id;

      const firstRun = await runForecastsForTenant(shamiJed.id, evalDate);
      expect(firstRun.historyEndDate).toBe("2026-11-12");
      expect(firstRun.forecastStartDate).toBe("2026-11-13");
      expect(firstRun.forecastEndDate).toBe("2026-11-19");
      expect(firstRun.itemsEvaluated).toBe(8);
      expect(firstRun.persistedRows).toBe(56);
      expect(firstRun.insufficientDataItemIds).toEqual([]);
      expect(firstRun.accuracy.totalMatchedPairs).toBeGreaterThanOrEqual(1);
      expect(firstRun.accuracy.overallWape).not.toBeNull();

      // Re-run replaces ONLY the future window and leaves past rows intact
      const secondRun = await runForecastsForTenant(shamiJed.id, evalDate);
      expect(secondRun.persistedRows).toBe(56);

      const futureRows = await shamiDb.forecastResult.findMany({
        where: {
          forDate: {
            gte: new Date("2026-11-13T00:00:00.000Z"),
            lte: new Date("2026-11-19T00:00:00.000Z"),
          },
        },
      });
      expect(futureRows).toHaveLength(56);

      const preservedPast = await shamiDb.forecastResult.findMany({
        where: { id: pastRow.id },
      });
      expect(preservedPast).toHaveLength(1);

      const diwanRun = await runForecastsForTenant(diwanMkh.id, evalDate);
      expect(diwanRun.itemsEvaluated).toBe(4);
      expect(diwanRun.persistedRows).toBe(28);

      // Tenant isolation check: DIWAN-MKH cannot see SHAMI-JED menuItem forecasts
      const leaked = await diwanDb.forecastResult.findMany({
        where: { menuItemId: shamiRice.id },
      });
      expect(leaked).toEqual([]);

      const latestAudit = await shamiDb.auditLog.findFirst({
        where: { action: "FORECAST_RUN_COMPLETED", entity: "ForecastAccuracy" },
        orderBy: { createdAt: "desc" },
      });
      expect(latestAudit).not.toBeNull();
    } finally {
      if (createdPastId) {
        await shamiDb.forecastResult.deleteMany({
          where: { id: createdPastId },
        });
      }
      await shamiDb.auditLog.deleteMany({
        where: { action: "FORECAST_RUN_COMPLETED" },
      });
    }
  });

  it("protects POST /api/cron/forecast with x-cron-secret and bypasses NextAuth cookie in middleware", async () => {
    expect(evaluateMiddlewareDecision("/api/cron/forecast", null)).toEqual({
      type: "next",
    });

    const prevSecret = process.env.CRON_SECRET;
    const runtimeSecret = randomUUID();
    process.env.CRON_SECRET = runtimeSecret;

    try {
      const missingRes = await cronForecastPost(
        new Request("http://localhost:3000/api/cron/forecast", {
          method: "POST",
        }),
      );
      expect(missingRes.status).toBe(401);

      const badBodyRes = await cronForecastPost(
        new Request("http://localhost:3000/api/cron/forecast", {
          method: "POST",
          headers: {
            "x-cron-secret": runtimeSecret,
            "content-type": "application/json",
          },
          body: JSON.stringify({ now: "invalid-date" }),
        }),
      );
      expect(badBodyRes.status).toBe(400);

      const okRes = await cronForecastPost(
        new Request("http://localhost:3000/api/cron/forecast", {
          method: "POST",
          headers: {
            "x-cron-secret": runtimeSecret,
            "content-type": "application/json",
          },
          body: JSON.stringify({ now: "2026-11-13T11:00:00.000Z" }),
        }),
      );
      expect(okRes.status).toBe(200);
      const json = (await okRes.json()) as {
        ok: boolean;
        tenantCount: number;
        totalPersistedRows: number;
      };
      expect(json.ok).toBe(true);
      expect(json.tenantCount).toBe(2);
      expect(json.totalPersistedRows).toBe(84);
    } finally {
      if (prevSecret === undefined) {
        delete process.env.CRON_SECRET;
      } else {
        process.env.CRON_SECRET = prevSecret;
      }
    }
  });
});
