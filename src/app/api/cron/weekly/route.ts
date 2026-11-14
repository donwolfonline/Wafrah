import { NextResponse } from "next/server";
import { runWeeklyCronJob } from "@/features/notifications";
import { requireCronNow } from "@/lib/cron";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handleCronWeekly(request: Request): Promise<NextResponse> {
  const gate = await requireCronNow(request);
  if (!gate.ok) {
    return gate.response;
  }

  const summary = await runWeeklyCronJob(gate.now, {
    maxDurationSeconds: maxDuration,
  });
  return NextResponse.json({
    ok: true,
    ...summary,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return withRequestContext(request, () => handleCronWeekly(request));
}

export async function POST(request: Request): Promise<NextResponse> {
  return withRequestContext(request, () => handleCronWeekly(request));
}
