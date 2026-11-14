import { NextResponse } from "next/server";
import { runForecastsForAllTenants } from "@/features/forecast";
import { requireCronNow } from "@/lib/cron";

async function handleCronForecast(request: Request): Promise<NextResponse> {
  const gate = await requireCronNow(request);
  if (!gate.ok) {
    return gate.response;
  }

  const summary = await runForecastsForAllTenants(gate.now);
  return NextResponse.json({
    ok: true,
    ...summary,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronForecast(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleCronForecast(request);
}
