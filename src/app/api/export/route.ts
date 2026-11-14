import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/features/auth/session";
import { exportTenantDataAsZip } from "@/features/privacy/export";
import {
  buildApiRateLimitKey,
  checkImportUploadRateLimit,
  createRateLimitResponse,
  extractClientIpFromHeaders,
} from "@/lib/api-rate-limit";
import { AuthorizationError, requireRole } from "@/lib/authz";
import { TenantIsolationError } from "@/lib/tenant";

export async function GET(request: Request): Promise<Response> {
  try {
    const sessionUser = await getServerSessionUser();
    const user = await requireRole(["MANAGER", "OWNER"], sessionUser);

    const rate = checkImportUploadRateLimit(
      buildApiRateLimitKey({
        userId: user.userId,
        ip: extractClientIpFromHeaders(request.headers),
        scope: "tenant-data-export",
      }),
    );
    if (!rate.allowed) {
      return createRateLimitResponse(rate);
    }

    const archive = await exportTenantDataAsZip(user);

    return new Response(new Uint8Array(archive.zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${archive.fileName}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
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
    return NextResponse.json(
      { error: "Failed to export restaurant data" },
      { status: 500 },
    );
  }
}
