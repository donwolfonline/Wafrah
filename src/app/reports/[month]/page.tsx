import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createTranslator } from "next-intl";
import { AppShell } from "@/components/shell/app-shell";
import { getServerSessionUser } from "@/features/auth/session";
import {
  getMonthlyReportForTenant,
  ReportsValidationError,
} from "@/features/reports";
import { ReportActionsBar } from "@/features/reports/report-actions-bar";
import { ReportBreakdowns } from "@/features/reports/report-breakdowns";
import { ReportSavingsHero } from "@/features/reports/report-savings-hero";
import { getAppLocale, getAppMessages } from "@/i18n/request";
import {
  AuthorizationError,
  getRoleHomePath,
  requireRole,
  type SessionUser,
} from "@/lib/authz";
import { formatGregorianDate, formatHijriDate } from "@/lib/format";
import { NOINDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NOINDEX_METADATA;
export const dynamic = "force-dynamic";

interface MonthlyReportPageProps {
  params: Promise<{ month: string }>;
}

export default async function MonthlyReportPage({
  params,
}: MonthlyReportPageProps) {
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect("/login");
  }

  let user: SessionUser;
  try {
    user = await requireRole(["MANAGER", "OWNER"], sessionUser);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect(getRoleHomePath(sessionUser.role));
    }
    throw error;
  }

  const { month } = await params;

  let report;
  try {
    report = await getMonthlyReportForTenant(user, month);
  } catch (error) {
    if (error instanceof ReportsValidationError) {
      notFound();
    }
    throw error;
  }

  const [locale, messages] = await Promise.all([
    getAppLocale(),
    getAppMessages(),
  ]);
  const t = createTranslator({ locale, messages, namespace: "reports.detail" });

  const restaurantTitle =
    locale === "ar" ? report.restaurant.nameAr : report.restaurant.name;
  const gregorianMonthLabel = formatGregorianDate(
    `${report.yearMonth}-15T12:00:00.000Z`,
    locale,
    { year: "numeric", month: "long", day: undefined },
  );
  const hijriStart = formatHijriDate(
    `${report.periodStartDate}T12:00:00.000Z`,
    locale,
  );
  const hijriEnd = formatHijriDate(
    `${report.periodEndDate}T12:00:00.000Z`,
    locale,
  );
  const generatedLabel = formatGregorianDate(report.generatedAtIso, locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <AppShell variant="manager" user={user}>
      <div className="mx-auto w-full max-w-4xl space-y-6 print:max-w-none print:space-y-3">
        <ReportActionsBar yearMonth={report.yearMonth} />

        <header className="rounded-lg border border-border bg-card p-5 print:p-3.5 print-avoid-break">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {t("reportHeading")}
              </p>
              <h1 className="text-2xl font-bold text-foreground">
                {restaurantTitle}
              </h1>
              <p className="text-sm text-muted-foreground">
                {report.restaurant.city} ·{" "}
                {t("branchCode", { code: report.restaurant.code })}
              </p>
            </div>
            <div className="space-y-1 text-end text-sm">
              <p className="text-lg font-semibold text-foreground">
                {gregorianMonthLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("hijriRange", { range: `${hijriStart} – ${hijriEnd}` })}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {t("generatedAt", { date: generatedLabel })}
              </p>
            </div>
          </div>
        </header>

        <ReportSavingsHero
          savings={report.savings}
          locale={locale}
          messages={messages}
        />

        <ReportBreakdowns
          report={report}
          locale={locale}
          messages={messages}
        />
      </div>
    </AppShell>
  );
}
