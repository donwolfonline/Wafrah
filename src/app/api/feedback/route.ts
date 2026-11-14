import { NextResponse } from "next/server";
import { FeedbackServiceError, submitFeedback } from "@/features/feedback";
import {
  buildApiRateLimitKey,
  checkApiWriteRateLimit,
  createRateLimitResponse,
} from "@/lib/api-rate-limit";
import { AuthorizationError, requireRole } from "@/lib/authz";
import { TenantIsolationError } from "@/lib/tenant";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireRole([
      "STAFF",
      "MANAGER",
      "OWNER",
      "PLATFORM_ADMIN",
    ]);
    const rate = checkApiWriteRateLimit(
      buildApiRateLimitKey({ userId: user.userId, scope: "feedback-post" }),
    );
    if (!rate.allowed) {
      return createRateLimitResponse(rate);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 },
      );
    }

    const feedback = await submitFeedback(user, body);
    return NextResponse.json({ ok: true, feedback }, { status: 201 });
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
    if (error instanceof FeedbackServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    console.error("[api/feedback] POST failed:", error);
    return NextResponse.json(
      { error: "Unable to submit feedback" },
      { status: 500 },
    );
  }
}
