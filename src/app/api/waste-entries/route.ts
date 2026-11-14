import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/features/auth/session";
import {
  createWasteEntryForUser,
  getWasteLogBootstrapForUser,
  undoWasteEntryForUser,
  WasteValidationError,
} from "@/features/waste/service";
import {
  buildApiRateLimitKey,
  checkApiWriteRateLimit,
  createRateLimitResponse,
  extractClientIpFromHeaders,
} from "@/lib/api-rate-limit";
import { AuthorizationError, requireRole } from "@/lib/authz";
import { TenantIsolationError } from "@/lib/tenant";

function handleApiError(error: unknown) {
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
  if (error instanceof WasteValidationError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }
  return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
}

export async function GET() {
  try {
    const sessionUser = await getServerSessionUser();
    const bootstrap = await getWasteLogBootstrapForUser(sessionUser);
    return NextResponse.json(bootstrap, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getServerSessionUser();
    const user = await requireRole("waste.create", sessionUser);
    const rate = await checkApiWriteRateLimit(
      buildApiRateLimitKey({
        userId: user.userId,
        ip: extractClientIpFromHeaders(request.headers),
        scope: "waste-entries-write",
      }),
    );
    if (!rate.allowed) {
      return createRateLimitResponse(rate);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const result = await createWasteEntryForUser(user, body);
    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await getServerSessionUser();
    const user = await requireRole("waste.create", sessionUser);
    const rate = await checkApiWriteRateLimit(
      buildApiRateLimitKey({
        userId: user.userId,
        ip: extractClientIpFromHeaders(request.headers),
        scope: "waste-entries-write",
      }),
    );
    if (!rate.allowed) {
      return createRateLimitResponse(rate);
    }

    const url = new URL(request.url);
    let clientId = url.searchParams.get("clientId");

    if (!clientId) {
      try {
        const body = (await request.json()) as { clientId?: string };
        clientId = body?.clientId ?? null;
      } catch {
        clientId = null;
      }
    }

    const result = await undoWasteEntryForUser(user, {
      clientId: clientId ?? "",
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
