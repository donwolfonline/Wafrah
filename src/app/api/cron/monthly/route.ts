import { NextResponse } from "next/server";
import { z } from "zod";
import { runMonthlyCronJob } from "@/features/notifications";
import { isCronAuthorized, parseCronJsonBody } from "@/lib/cron";

const MonthlyCronBodySchema = z.object({
  now: z.string().datetime().optional(),
  yearMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

async function handleCronMonthly(request: Request): Promise<NextResponse> {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "GET" || request.method === "HEAD") {
    const url = new URL(request.url);
    const parsedQuery = MonthlyCronBodySchema.safeParse({
      now: url.searchParams.get("now") ?? undefined,
      yearMonth: url.searchParams.get("yearMonth") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: "Invalid request query",
          details: parsedQuery.error.flatten(),
        },
        { status: 400 },
      );
    }

    const now = parsedQuery.data.now ? new Date(parsedQuery.data.now) : new Date();
    const summary = await runMonthlyCronJob(now, parsedQuery.data.yearMonth);
    return NextResponse.json({
      ok: true,
      ...summary,
    });
  }

  const parsed = await parseCronJsonBody(request, MonthlyCronBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const now = parsed.data.now ? new Date(parsed.data.now) : new Date();
  const summary = await runMonthlyCronJob(now, parsed.data.yearMonth);
  return NextResponse.json({
    ok: true,
    ...summary,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronMonthly(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleCronMonthly(request);
}
