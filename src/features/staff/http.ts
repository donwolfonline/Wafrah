import { NextResponse } from "next/server";
import {
  buildApiRateLimitKey,
  checkApiWriteRateLimit,
  createRateLimitResponse,
} from "@/lib/api-rate-limit";
import { logger } from "@/lib/logger";
import { AuthorizationError, type SessionUser } from "@/lib/authz";
import { TenantIsolationError } from "@/lib/tenant";
import { StaffServiceError } from "./schemas";

export async function checkStaffWriteRate(
  user: SessionUser,
  scope: string,
): Promise<NextResponse | null> {
  const rate = await checkApiWriteRateLimit(
    buildApiRateLimitKey({ userId: user.userId, scope }),
  );
  return rate.allowed ? null : createRateLimitResponse(rate);
}

export function handleStaffHttpError(error: unknown): NextResponse {
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
  if (error instanceof StaffServiceError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
  }
  logger.error("staff.unexpected_error", { error });
  return NextResponse.json(
    { error: "Unable to complete staff action" },
    { status: 500 },
  );
}
