import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  createMenuItemForTenant,
  listMenuItemsForTenant,
} from "@/features/menu/service";
import {
  buildApiRateLimitKey,
  checkApiWriteRateLimit,
  createRateLimitResponse,
  extractClientIpFromHeaders,
} from "@/lib/api-rate-limit";
import { AuthorizationError, requireRole } from "@/lib/authz";
import { TenantIsolationError } from "@/lib/tenant";

function handleMenuError(error: unknown) {
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
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: error instanceof ZodError ? error.issues : undefined,
      },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const items = await listMenuItemsForTenant();
    return NextResponse.json({ items });
  } catch (error) {
    return handleMenuError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("menu.manage");
    const rate = await checkApiWriteRateLimit(
      buildApiRateLimitKey({
        userId: user.userId,
        ip: extractClientIpFromHeaders(request.headers),
        scope: "menu-write",
      }),
    );
    if (!rate.allowed) {
      return createRateLimitResponse(rate);
    }

    const body: unknown = await request.json();
    const item = await createMenuItemForTenant(body, user);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleMenuError(error);
  }
}
