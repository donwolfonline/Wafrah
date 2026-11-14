import { NextResponse } from "next/server";
import { runInsightsForAllTenants } from "@/features/insights";
import { requireCronNow } from "@/lib/cron";

async function handleCronInsights(request: Request): Promise<NextResponse> {
  const gate = await requireCronNow(request);
  if (!gate.ok) {
    return gate.response;
  }

  const summary = await runInsightsForAllTenants(gate.now);
  return NextResponse.json({
    ok: true,
    ...summary,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronInsights(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleCronInsights(request);
}
