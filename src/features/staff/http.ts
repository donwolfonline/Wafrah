import { NextResponse } from "next/server";
import {
  buildApiRateLimitKey,
  checkApiWriteRateLimit,
  createRateLimitResponse,
} from "@/lib/api-rate-limit";
import { AuthorizationError, type SessionUser } from "@/lib/authz";
import { TenantIsolationError } from "@/lib/tenant";
import { StaffServiceError } from "./schemas";

export function checkStaffWriteRate(
  user: SessionUser,
  scope: string,
): NextResponse | null {
  const rate = checkApiWriteRateLimit(
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
  console.error("[api/staff] unexpected error:", error);
  return NextResponse.json(
    { error: "Unable to complete staff action" },
    { status: 500 },
  );
}
