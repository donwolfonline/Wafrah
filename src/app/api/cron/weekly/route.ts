import { NextResponse } from "next/server";
import { runWeeklyCronJob } from "@/features/notifications";
import { requireCronNow } from "@/lib/cron";

async function handleCronWeekly(request: Request): Promise<NextResponse> {
  const gate = await requireCronNow(request);
  if (!gate.ok) {
    return gate.response;
  }

  const summary = await runWeeklyCronJob(gate.now);
  return NextResponse.json({
    ok: true,
    ...summary,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronWeekly(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleCronWeekly(request);
}
