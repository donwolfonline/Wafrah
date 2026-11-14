import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  buildApiRateLimitKey,
  checkApiWriteRateLimit,
  createRateLimitResponse,
} from "@/lib/api-rate-limit";
import { AuthorizationError, requireRole, type SessionUser } from "@/lib/authz";
import { TenantIsolationError } from "@/lib/tenant";
import { deleteAdminRestaurant } from "./deletion";
import { getTenantDiagnostics } from "./diagnostics";
import { createAdminRestaurant } from "./mutations";
import { getAdminOverview } from "./queries";
import { AdminServiceError, restaurantIdSchema } from "./schemas";
import {
  setRestaurantSuspension,
  updateAdminSubscription,
} from "./subscription-mutations";

function handleAdminHttpError(error: unknown): NextResponse {
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
  if (error instanceof AdminServiceError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }
  throw error;
}

function checkAdminWriteRate(user: SessionUser, scope: string): NextResponse | null {
  const rate = checkApiWriteRateLimit(
    buildApiRateLimitKey({ userId: user.userId, scope }),
  );
  return rate.allowed ? null : createRateLimitResponse(rate);
}

function parseRestaurantIdParam(rawId: string): string {
  const parsed = restaurantIdSchema.safeParse(rawId);
  if (!parsed.success) {
    throw new AdminServiceError("Invalid restaurant ID", 400);
  }
  return parsed.data;
}

export async function handleAdminOverviewGet(
  sessionOverride?: SessionUser | null,
): Promise<NextResponse> {
  try {
    const user = await requireRole("admin.*", sessionOverride);
    const data = await getAdminOverview(user);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return handleAdminHttpError(error);
  }
}

export async function handleAdminRestaurantsPost(
  request: Request,
  sessionOverride?: SessionUser | null,
): Promise<NextResponse> {
  try {
    const user = await requireRole("admin.*", sessionOverride);
    const limited = checkAdminWriteRate(user, "admin-restaurants-post");
    if (limited) return limited;
    const body: unknown = await request.json();
    const result = await createAdminRestaurant(user, body);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return handleAdminHttpError(error);
  }
}

export async function handleAdminSubscriptionPatch(
  request: Request,
  restaurantId: string,
  sessionOverride?: SessionUser | null,
): Promise<NextResponse> {
  try {
    const user = await requireRole("admin.*", sessionOverride);
    const limited = checkAdminWriteRate(user, "admin-subscription-patch");
    if (limited) return limited;
    const validId = parseRestaurantIdParam(restaurantId);
    const body: unknown = await request.json();
    const subscription = await updateAdminSubscription(user, validId, body);
    return NextResponse.json({ ok: true, subscription });
  } catch (error) {
    return handleAdminHttpError(error);
  }
}

export async function handleAdminSuspendPost(
  request: Request,
  restaurantId: string,
  sessionOverride?: SessionUser | null,
): Promise<NextResponse> {
  try {
    const user = await requireRole("admin.*", sessionOverride);
    const limited = checkAdminWriteRate(user, "admin-suspend-post");
    if (limited) return limited;
    const validId = parseRestaurantIdParam(restaurantId);
    const body: unknown = await request.json();
    const subscription = await setRestaurantSuspension(user, validId, body);
    return NextResponse.json({ ok: true, subscription });
  } catch (error) {
    return handleAdminHttpError(error);
  }
}

export async function handleAdminDiagnosticsGet(
  restaurantId: string,
  sessionOverride?: SessionUser | null,
): Promise<NextResponse> {
  try {
    const user = await requireRole("admin.*", sessionOverride);
    const validId = parseRestaurantIdParam(restaurantId);
    const diagnostics = await getTenantDiagnostics(user, validId);
    return NextResponse.json({ ok: true, diagnostics });
  } catch (error) {
    return handleAdminHttpError(error);
  }
}

export async function handleAdminRestaurantDelete(
  request: Request,
  restaurantId: string,
  sessionOverride?: SessionUser | null,
): Promise<NextResponse> {
  try {
    const user = await requireRole("admin.*", sessionOverride);
    const limited = checkAdminWriteRate(user, "admin-restaurant-delete");
    if (limited) return limited;
    const validId = parseRestaurantIdParam(restaurantId);
    const body: unknown = await request.json();
    const result = await deleteAdminRestaurant(user, validId, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleAdminHttpError(error);
  }
}
