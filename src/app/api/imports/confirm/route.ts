import { NextResponse } from "next/server";
import { handleImportRouteError } from "@/features/sales/api-errors";
import { MAX_IMPORT_UPLOAD_BYTES } from "@/features/sales/import-files";
import {
  confirmImportForTenant,
  ImportInputError,
} from "@/features/sales/service";
import {
  buildApiRateLimitKey,
  checkApiWriteRateLimit,
  createRateLimitResponse,
  extractClientIpFromHeaders,
} from "@/lib/api-rate-limit";
import { requireRole } from "@/lib/authz";

export async function POST(request: Request) {
  try {
    const user = await requireRole("sales.import");
    const ip = extractClientIpFromHeaders(request.headers);
    const rate = checkApiWriteRateLimit(
      buildApiRateLimitKey({
        userId: user.userId,
        ip,
        scope: "imports-confirm",
      }),
    );
    if (!rate.allowed) {
      return createRateLimitResponse(rate);
    }

    const declaredLength = Number.parseInt(
      request.headers.get("content-length") ?? "",
      10,
    );
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_IMPORT_UPLOAD_BYTES
    ) {
      throw new ImportInputError("Request payload exceeds 5 MB limit", 413);
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_IMPORT_UPLOAD_BYTES) {
      throw new ImportInputError("Request payload exceeds 5 MB limit", 413);
    }

    const body: unknown = JSON.parse(rawBody);
    const result = await confirmImportForTenant(body, user);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleImportRouteError(error);
  }
}
