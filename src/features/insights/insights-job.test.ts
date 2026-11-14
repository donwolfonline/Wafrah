import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { POST as cronInsightsPost } from "@/app/api/cron/insights/route";
import { runInsightsForTenant } from "@/features/insights";
import { evaluateMiddlewareDecision } from "@/lib/authz";
import { createTenantDb, platformAdminDb } from "@/lib/tenant";

describe("Insights job, cron endpoint, and seeded verification", () => {
  it("produces a WASTE_SPIKE alert only for SHM-RICE in SHAMI-JED and stays idempotent on reruns", async () => {
    const shamiJed = await platformAdminDb.restaurant.findUniqueOrThrow({
      where: { code: "SHAMI-JED" },
      select: { id: true },
    });
    const diwanMkh = await platformAdminDb.restaurant.findUniqueOrThrow({
      where: { code: "DIWAN-MKH" },
      select: { id: true },
    });

    const evalDate = new Date("2026-11-12T20:00:00.000Z"); // 23:00 Asia/Riyadh on 2026-11-12

    const firstJeddah = await runInsightsForTenant(shamiJed.id, evalDate);
    expect(firstJeddah.windowEndDate).toBe("2026-11-12");
    expect(firstJeddah.spikes).toHaveLength(1);
    expect(firstJeddah.spikes[0]).toMatchObject({
      itemCode: "SHM-RICE",
      severity: "WARNING",
      comparisonMode: "WEEKDAY",
    });
    expect(firstJeddah.persistedAlerts).toHaveLength(1);
    expect(firstJeddah.persistedAlerts[0]?.messageKey).toBe(
      "insights.alerts.wasteSpike",
    );

    const diwanResult = await runInsightsForTenant(diwanMkh.id, evalDate);
    expect(diwanResult.spikes).toEqual([]);
    expect(diwanResult.persistedAlerts).toEqual([]);

    // Re-running must preserve the exact same Alert ID and create zero duplicates
    const secondJeddah = await runInsightsForTenant(shamiJed.id, evalDate);
    expect(secondJeddah.persistedAlerts).toHaveLength(1);
    expect(secondJeddah.persistedAlerts[0]?.id).toBe(
      firstJeddah.persistedAlerts[0]?.id,
    );

    const dedupeKey = firstJeddah.persistedAlerts[0]!.dedupeKey;
    const shamiDb = createTenantDb(shamiJed.id);
    const diwanDb = createTenantDb(diwanMkh.id);

    const matchingAlerts = await shamiDb.alert.findMany({
      where: { dedupeKey },
    });
    expect(matchingAlerts).toHaveLength(1);

    // Tenant scoping prevents DIWAN-MKH from seeing SHAMI-JED's alert
    const leaked = await diwanDb.alert.findMany({
      where: { dedupeKey },
    });
    expect(leaked).toEqual([]);
  });

  it("enforces x-cron-secret on POST /api/cron/insights while bypassing NextAuth cookie in middleware", async () => {
    expect(evaluateMiddlewareDecision("/api/cron/insights", null)).toEqual({
      type: "next",
    });

    const prevSecret = process.env.CRON_SECRET;
    const runtimeTestSecret = randomUUID();
    process.env.CRON_SECRET = runtimeTestSecret;

    try {
      const missingRes = await cronInsightsPost(
        new Request("http://localhost:3000/api/cron/insights", {
          method: "POST",
        }),
      );
      expect(missingRes.status).toBe(401);

      const wrongRes = await cronInsightsPost(
        new Request("http://localhost:3000/api/cron/insights", {
          method: "POST",
          headers: { "x-cron-secret": randomUUID() },
        }),
      );
      expect(wrongRes.status).toBe(401);

      const invalidBodyRes = await cronInsightsPost(
        new Request("http://localhost:3000/api/cron/insights", {
          method: "POST",
          headers: {
            "x-cron-secret": runtimeTestSecret,
            "content-type": "application/json",
          },
          body: JSON.stringify({ now: "not-an-iso-timestamp" }),
        }),
      );
      expect(invalidBodyRes.status).toBe(400);

      const okRes = await cronInsightsPost(
        new Request("http://localhost:3000/api/cron/insights", {
          method: "POST",
          headers: {
            "x-cron-secret": runtimeTestSecret,
            "content-type": "application/json",
          },
          body: JSON.stringify({ now: "2026-11-12T20:00:00.000Z" }),
        }),
      );
      expect(okRes.status).toBe(200);
      const json = (await okRes.json()) as {
        ok: boolean;
        tenantCount: number;
        totalAlertsUpserted: number;
      };
      expect(json.ok).toBe(true);
      expect(json.tenantCount).toBe(2);
      expect(json.totalAlertsUpserted).toBe(1);
    } finally {
      if (prevSecret === undefined) {
        delete process.env.CRON_SECRET;
      } else {
        process.env.CRON_SECRET = prevSecret;
      }
    }
  });
});
