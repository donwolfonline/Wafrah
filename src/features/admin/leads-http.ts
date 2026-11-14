import { NextResponse } from "next/server";
import {
  buildApiRateLimitKey,
  checkApiWriteRateLimit,
  createRateLimitResponse,
} from "@/lib/api-rate-limit";
import { logger } from "@/lib/logger";
import { toTimeZoneDateKey } from "@/features/insights";
import { AuthorizationError, requireRole } from "@/lib/authz";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import { TenantIsolationError } from "@/lib/tenant";
import {
  buildLeadsCsv,
  LeadAdminError,
  listAdminLeads,
  updateAdminLead,
} from "./leads-service";

function handleAdminLeadError(error: unknown): NextResponse {
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
  if (error instanceof LeadAdminError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }
  logger.error("admin.leads.unexpected_error", { error });
  return NextResponse.json(
    { error: "Unable to process admin lead request" },
    { status: 500 },
  );
}

function readFiltersFromUrl(request: Request) {
  const { searchParams } = new URL(request.url);
  return {
    status: searchParams.get("status") || undefined,
    city: searchParams.get("city") || undefined,
    search: searchParams.get("search") || undefined,
  };
}

export async function handleAdminLeadsGet(
  request: Request,
): Promise<NextResponse> {
  try {
    const admin = await requireRole("admin.*");
    const leads = await listAdminLeads(admin, readFiltersFromUrl(request));
    return NextResponse.json({ leads }, { status: 200 });
  } catch (error) {
    return handleAdminLeadError(error);
  }
}

export async function handleAdminLeadPatch(
  request: Request,
  leadId: string,
): Promise<NextResponse> {
  try {
    const admin = await requireRole("admin.*");
    const rate = await checkApiWriteRateLimit(
      buildApiRateLimitKey({
        userId: admin.userId,
        scope: "admin-lead-patch",
      }),
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

    const lead = await updateAdminLead(admin, leadId, body);
    return NextResponse.json({ ok: true, lead }, { status: 200 });
  } catch (error) {
    return handleAdminLeadError(error);
  }
}

export async function handleAdminLeadsExportGet(
  request: Request,
): Promise<NextResponse> {
  try {
    const admin = await requireRole("admin.*");
    const { searchParams } = new URL(request.url);
    const locale = searchParams.get("locale") === "ar" ? "ar" : "en";
    const leads = await listAdminLeads(admin, readFiltersFromUrl(request));
    const csv = buildLeadsCsv(leads, locale);
    const dateKey = toTimeZoneDateKey(new Date(), RIYADH_TIME_ZONE);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wafrah-leads-${dateKey}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleAdminLeadError(error);
  }
}
