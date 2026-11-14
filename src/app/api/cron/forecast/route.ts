import { NextResponse } from "next/server";
import { runForecastsForAllTenants } from "@/features/forecast";
import { requireCronNow } from "@/lib/cron";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handleCronForecast(request: Request): Promise<NextResponse> {
  const gate = await requireCronNow(request);
  if (!gate.ok) {
    return gate.response;
  }

  const summary = await runForecastsForAllTenants(gate.now, undefined, {
    maxDurationSeconds: maxDuration,
  });
  return NextResponse.json({
    ok: true,
    ...summary,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return withRequestContext(request, () => handleCronForecast(request));
}

export async function POST(request: Request): Promise<NextResponse> {
  return withRequestContext(request, () => handleCronForecast(request));
}
