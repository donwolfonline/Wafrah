import { NextResponse } from "next/server";
import { submitPilotLead } from "@/features/leads/service";
import { extractClientIpFromHeaders } from "@/lib/api-rate-limit";
import { withRequestContext } from "@/lib/request-context";

export async function POST(request: Request): Promise<NextResponse> {
  return withRequestContext(request, async () => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, errorCode: "validationFailed" },
      { status: 400 },
    );
  }

  const clientIp = extractClientIpFromHeaders(request.headers);
  const result = await submitPilotLead(body, clientIp);

  if (!result.ok) {
    const headers: Record<string, string> = {};
    if (result.status === 429 && result.retryAfterSeconds) {
      headers["Retry-After"] = String(result.retryAfterSeconds);
    }
    return NextResponse.json(
      {
        ok: false,
        errorCode: result.errorCode,
        fieldErrors: result.fieldErrors,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      { status: result.status, headers },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      deduplicated: result.deduplicated,
      locale: result.locale,
      city: result.city,
      posSystem: result.posSystem,
      branchesBand: result.branchesBand,
    },
    { status: result.status },
  );
  });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, error: "Method not allowed" },
    { status: 405 },
  );
}
