import { NextResponse } from "next/server";
import { withRequestContext } from "@/lib/request-context";
import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

const APP_VERSION =
  typeof packageJson.version === "string" && packageJson.version.length > 0
    ? packageJson.version
    : "0.1.0";

/**
 * Minimal public liveness endpoint returning status, version, and UTC timestamp
 * without querying internals or exposing environment metadata.
 */
export async function GET(request: Request) {
  return withRequestContext(request, async () =>
    NextResponse.json(
      {
        status: "ok",
        version: APP_VERSION,
        time: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      },
    ),
  );
}
