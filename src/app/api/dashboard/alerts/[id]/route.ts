import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSessionUser } from "@/features/auth/session";
import {
  DashboardNotFoundError,
  updateDashboardAlertStatus,
} from "@/features/dashboard";
import {
  buildApiRateLimitKey,
  checkApiWriteRateLimit,
  createRateLimitResponse,
  extractClientIpFromHeaders,
} from "@/lib/api-rate-limit";
import { AuthorizationError, requireRole } from "@/lib/authz";
import { TenantIsolationError } from "@/lib/tenant";

const AlertIdSchema = z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);

const PatchAlertSchema = z.object({
  status: z.enum(["READ", "DISMISSED"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const sessionUser = await getServerSessionUser();
    const user = await requireRole(["MANAGER", "OWNER"], sessionUser);

    const rate = await checkApiWriteRateLimit(
      buildApiRateLimitKey({
        userId: user.userId,
        ip: extractClientIpFromHeaders(request.headers),
        scope: "dashboard-alert-patch",
      }),
    );
    if (!rate.allowed) {
      return createRateLimitResponse(rate);
    }

    const rawParams = await context.params;
    const idResult = AlertIdSchema.safeParse(rawParams.id);
    if (!idResult.success) {
      return NextResponse.json({ error: "Invalid alert ID" }, { status: 400 });
    }

    const body: unknown = await request.json();
    const parsed = PatchAlertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid alert status payload" },
        { status: 400 },
      );
    }

    const alert = await updateDashboardAlertStatus(
      user,
      idResult.data,
      parsed.data.status,
    );
    return NextResponse.json({ ok: true, alert });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    if (error instanceof TenantIsolationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    if (error instanceof DashboardNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Malformed JSON body" },
        { status: 400 },
      );
    }
    throw error;
  }
}
