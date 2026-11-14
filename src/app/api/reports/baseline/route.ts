import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/features/auth/session";
import {
  ReportsValidationError,
  updateRestaurantBaselineForTenant,
} from "@/features/reports";
import {
  buildApiRateLimitKey,
  checkApiWriteRateLimit,
  createRateLimitResponse,
  extractClientIpFromHeaders,
} from "@/lib/api-rate-limit";
import { AuthorizationError, requireRole } from "@/lib/authz";
import { TenantIsolationError } from "@/lib/tenant";

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const sessionUser = await getServerSessionUser();
    const user = await requireRole(["MANAGER", "OWNER"], sessionUser);

    const rate = checkApiWriteRateLimit(
      buildApiRateLimitKey({
        userId: user.userId,
        ip: extractClientIpFromHeaders(request.headers),
        scope: "reports-baseline-patch",
      }),
    );
    if (!rate.allowed) {
      return createRateLimitResponse(rate);
    }

    const body: unknown = await request.json();
    const baseline = await updateRestaurantBaselineForTenant(user, body);
    return NextResponse.json({ ok: true, baseline });
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
    if (error instanceof ReportsValidationError) {
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
