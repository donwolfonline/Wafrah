import { createTranslator } from "next-intl";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSessionUser } from "@/features/auth/session";
import {
  buildReportDailyCsv,
  getMonthlyReportForTenant,
  ReportsValidationError,
} from "@/features/reports";
import {
  getAppLocale,
  getAppMessages,
} from "@/i18n/request";
import { AuthorizationError, requireRole } from "@/lib/authz";
import { TenantIsolationError } from "@/lib/tenant";

const ReportParamsSchema = z.object({
  month: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid report month"),
  locale: z.enum(["ar", "en"]).optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ month: string }> },
): Promise<NextResponse> {
  try {
    const sessionUser = await getServerSessionUser();
    const user = await requireRole(["MANAGER", "OWNER"], sessionUser);

    const { month } = await context.params;
    const url = new URL(request.url);
    const rawLocale = url.searchParams.get("locale");
    const parsedParams = ReportParamsSchema.safeParse({
      month,
      locale: rawLocale === null ? undefined : rawLocale,
    });
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: parsedParams.error.issues[0]?.message ?? "Invalid report parameters" },
        { status: 400 },
      );
    }

    const locale = parsedParams.data.locale ?? (await getAppLocale());
    const [report, messages] = await Promise.all([
      getMonthlyReportForTenant(user, parsedParams.data.month),
      getAppMessages(locale),
    ]);

    const t = createTranslator({ locale, messages, namespace: "reports" });
    const headers = [
      t("csv.headers.date"),
      t("csv.headers.wasteEntries"),
      t("csv.headers.wasteQtySum"),
      t("csv.headers.wasteSar"),
      t("csv.headers.unitsSold"),
      t("csv.headers.wasteSarPerUnit"),
      t("csv.headers.purchasesSar"),
    ] as const;

    const csv = buildReportDailyCsv(report.dailyRows, headers);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wafrah-report-${report.yearMonth}.csv"`,
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
    if (error instanceof ReportsValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    throw error;
  }
}
