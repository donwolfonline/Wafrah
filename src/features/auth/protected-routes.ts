import { NextResponse } from "next/server";
import { AuthorizationError, requireRole, type SessionUser } from "@/lib/authz";
import { getPlatformAdminDb, getTenantDb } from "@/lib/tenant";

export async function handleDashboardGet(sessionOverride?: SessionUser | null) {
  try {
    const user = await requireRole(["MANAGER", "OWNER"], sessionOverride);
    const db = await getTenantDb(user);
    const menuItemCount = await db.menuItem.count();

    return NextResponse.json({
      tenantId: user.tenantId,
      role: user.role,
      menuItemCount,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    throw error;
  }
}

export async function handleAdminGet(sessionOverride?: SessionUser | null) {
  try {
    const user = await requireRole("admin.*", sessionOverride);
    const db = await getPlatformAdminDb(user);
    const restaurantCount = await db.restaurant.count();

    return NextResponse.json({
      role: user.role,
      restaurantCount,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    throw error;
  }
}
