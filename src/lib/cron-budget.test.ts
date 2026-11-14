import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CRON_MAX_DURATION_SECONDS,
  CRON_TIME_BUDGET_RATIO,
  computeCronBudgetMs,
  executeBudgetedCronTenantLoop,
  extractSkippedTenantIds,
  isCronBudgetExceeded,
  prioritizeTenantsBySkippedIds,
  resolveSundayWeekKey,
} from "@/lib/cron-budget";
import {
  CRON_DEEP_HEALTH_MAX_AGE_MS,
  evaluateDeepHealthStatus,
  isSuccessfulCronSummaryMetadata,
} from "@/lib/health-deep";

describe("cron time budget & skipped-tenant prioritization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes 80% budget of maxDuration", () => {
    expect(CRON_MAX_DURATION_SECONDS).toBe(300);
    expect(CRON_TIME_BUDGET_RATIO).toBe(0.8);
    expect(computeCronBudgetMs(300, 0.8)).toBe(240_000);
    expect(computeCronBudgetMs(60, 0.8)).toBe(48_000);
    expect(isCronBudgetExceeded(1000, 240_000, 240_999)).toBe(false);
    expect(isCronBudgetExceeded(1000, 240_000, 241_000)).toBe(true);
  });

  it("prioritizes previously skipped tenants first and drops stale IDs", () => {
    const tenants = [
      { id: "t1", code: "T1" },
      { id: "t2", code: "T2" },
      { id: "t3", code: "T3" },
      { id: "t4", code: "T4" },
    ];

    const reordered = prioritizeTenantsBySkippedIds(tenants, [
      "t3",
      "deleted-id",
      "t4",
      "t3",
    ]);
    expect(reordered.map((t) => t.id)).toEqual(["t3", "t4", "t1", "t2"]);
    expect(
      extractSkippedTenantIds({ skippedTenantIds: [" t3 ", "", 42, "t4", "t3"] }),
    ).toEqual(["t3", "t4"]);
  });

  it("stops starting new tenants at budget limit and picks skipped tenants up first on next run", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const tenants = [
      { id: "t1", code: "T1" },
      { id: "t2", code: "T2" },
      { id: "t3", code: "T3" },
      { id: "t4", code: "T4" },
    ];

    let clockMs = 0;
    const processedRun1: string[] = [];

    const run1 = await executeBudgetedCronTenantLoop({
      job: "daily",
      auditAction: "CRON_DAILY_COMPLETED",
      tenants,
      budget: {
        budgetMs: 80,
        nowMs: () => clockMs,
        prioritizeTenantIds: [],
      },
      runTenant: async (tenant) => {
        processedRun1.push(tenant.id);
        clockMs += 45;
        return { tenantId: tenant.id, status: "OK" as const };
      },
      onTenantFailed: (tenant, error) => ({
        tenantId: tenant.id,
        status: "FAILED" as const,
        error,
      }),
      onTenantSkipped: (tenant) => ({
        tenantId: tenant.id,
        status: "SKIPPED" as const,
      }),
    });

    // t1: starts at 0ms -> ends at 45ms; t2: starts at 45ms (<80ms) -> ends at 90ms; t3 >= 80ms -> skipped!
    expect(processedRun1).toEqual(["t1", "t2"]);
    expect(run1.stoppedEarlyByBudget).toBe(true);
    expect(run1.skippedTenantIds).toEqual(["t3", "t4"]);
    expect(run1.outcomes.filter((o) => o.status === "SKIPPED")).toHaveLength(2);

    // Next run prioritizes skipped tenants [t3, t4] first!
    let clockRun2Ms = 0;
    const processedRun2: string[] = [];
    const run2 = await executeBudgetedCronTenantLoop({
      job: "daily",
      auditAction: "CRON_DAILY_COMPLETED",
      tenants,
      budget: {
        budgetMs: 80,
        nowMs: () => clockRun2Ms,
        prioritizeTenantIds: run1.skippedTenantIds,
      },
      runTenant: async (tenant) => {
        processedRun2.push(tenant.id);
        clockRun2Ms += 45;
        return { tenantId: tenant.id, status: "OK" as const };
      },
      onTenantFailed: (tenant, error) => ({
        tenantId: tenant.id,
        status: "FAILED" as const,
        error,
      }),
      onTenantSkipped: (tenant) => ({
        tenantId: tenant.id,
        status: "SKIPPED" as const,
      }),
    });

    expect(processedRun2).toEqual(["t3", "t4"]);
    expect(run2.skippedTenantIds).toEqual(["t1", "t2"]);
  });

  it("maps Saudi business week starting Sunday for weekly idempotency", () => {
    expect(resolveSundayWeekKey("2026-11-15")).toBe("2026-11-15"); // Sunday
    expect(resolveSundayWeekKey("2026-11-16")).toBe("2026-11-15"); // Monday retry
    expect(resolveSundayWeekKey("2026-11-21")).toBe("2026-11-15"); // Saturday
    expect(resolveSundayWeekKey("2026-11-22")).toBe("2026-11-22"); // Next Sunday
  });
});

describe("deep health evaluator", () => {
  it("evaluates DB connectivity and cron AuditLog freshness", () => {
    const now = new Date("2026-11-15T06:00:00.000Z");
    const freshRun = new Date(now.getTime() - 60 * 60 * 1000);
    const staleRun = new Date(now.getTime() - CRON_DEEP_HEALTH_MAX_AGE_MS - 60_000);

    expect(
      evaluateDeepHealthStatus({
        dbOk: true,
        dbLatencyMs: 5,
        lastSuccessAt: freshRun,
        now,
      }).healthy,
    ).toBe(true);

    expect(
      evaluateDeepHealthStatus({
        dbOk: false,
        dbLatencyMs: 5,
        lastSuccessAt: freshRun,
        now,
      }).healthy,
    ).toBe(false);

    const missing = evaluateDeepHealthStatus({
      dbOk: true,
      dbLatencyMs: 5,
      lastSuccessAt: null,
      now,
    });
    expect(missing.healthy).toBe(false);
    expect(missing.cron.status).toBe("missing");

    const stale = evaluateDeepHealthStatus({
      dbOk: true,
      dbLatencyMs: 5,
      lastSuccessAt: staleRun,
      now,
    });
    expect(stale.healthy).toBe(false);
    expect(stale.cron.status).toBe("stale");
  });

  it("treats 100%-failed multi-tenant summaries as unsuccessful", () => {
    expect(
      isSuccessfulCronSummaryMetadata({
        tenantCount: 0,
        tenantsSucceeded: 0,
        tenantsFailed: 0,
      }),
    ).toBe(true);
    expect(
      isSuccessfulCronSummaryMetadata({
        tenantCount: 2,
        tenantsSucceeded: 1,
        tenantsFailed: 1,
      }),
    ).toBe(true);
    expect(
      isSuccessfulCronSummaryMetadata({
        tenantCount: 2,
        tenantsSucceeded: 0,
        tenantsFailed: 2,
      }),
    ).toBe(false);
  });
});
