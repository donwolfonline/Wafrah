import { NextResponse } from "next/server";
import { platformAdminDb } from "@/lib/db";
import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

const APP_VERSION =
  typeof packageJson.version === "string" && packageJson.version.length > 0
    ? packageJson.version
    : "0.1.0";

function buildHealthHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
}

/**
 * Unauthenticated runtime health endpoint verifying database connectivity
 * and returning minimal build metadata without leaking credentials or stack traces.
 */
export async function GET() {
  const startedAt = Date.now();
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA
    ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
    : null;
  const region = process.env.VERCEL_REGION ?? "local";

  try {
    await platformAdminDb.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startedAt;

    return NextResponse.json(
      {
        status: "ok",
        db: "up",
        version: APP_VERSION,
        commitSha,
        region,
        latencyMs,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: buildHealthHeaders() },
    );
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    console.error(
      JSON.stringify({
        event: "HEALTH_CHECK_DEGRADED",
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    );

    return NextResponse.json(
      {
        status: "degraded",
        db: "down",
        version: APP_VERSION,
        commitSha,
        region,
        latencyMs,
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: buildHealthHeaders() },
    );
  }
}
