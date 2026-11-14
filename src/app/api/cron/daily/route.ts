import { NextResponse } from "next/server";
import { runDailyCronJob } from "@/features/notifications";
import { requireCronNow } from "@/lib/cron";

async function handleCronDaily(request: Request): Promise<NextResponse> {
  const gate = await requireCronNow(request);
  if (!gate.ok) {
    return gate.response;
  }

  const summary = await runDailyCronJob(gate.now);
  return NextResponse.json({
    ok: true,
    ...summary,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronDaily(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleCronDaily(request);
}
