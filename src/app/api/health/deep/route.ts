import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron";
import { runDeepHealthCheck } from "@/lib/health-deep";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";
import packageJson from "../../../../../package.json";

export const dynamic = "force-dynamic";

const APP_VERSION =
  typeof packageJson.version === "string" && packageJson.version.length > 0
    ? packageJson.version
    : "0.1.0";

function buildHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
}

/**
 * Bearer-protected readiness check verifying PostgreSQL connectivity and the
 * age of the latest successful daily cron execution recorded in AuditLog.
 */
export async function GET(request: Request) {
  return withRequestContext(request, async () => {
    const auth = authorizeCronRequest(request);
    if (!auth.ok) {
      return auth.response;
    }

    const now = new Date();
    const result = await runDeepHealthCheck(now);

    if (!result.healthy) {
      logger.warn("health.deep.unhealthy", {
        dbStatus: result.db.status,
        cronStatus: result.cron.status,
        ageMinutes: result.cron.ageMinutes,
      });
    }

    return NextResponse.json(
      {
        status: result.healthy ? "ok" : "unhealthy",
        version: APP_VERSION,
        time: now.toISOString(),
        checks: {
          db: result.db,
          cron: result.cron,
        },
      },
      {
        status: result.healthy ? 200 : 503,
        headers: buildHeaders(),
      },
    );
  });
}
