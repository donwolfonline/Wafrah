import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Download, FileBarChart2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createTranslator } from "next-intl";
import { AppShell } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getServerSessionUser } from "@/features/auth/session";
import { listReportMonthsForTenant } from "@/features/reports";
import { BaselineSettingsCard } from "@/features/reports/baseline-settings-card";
import { getAppLocale, getAppMessages } from "@/i18n/request";
import {
  AuthorizationError,
  getRoleHomePath,
  requireRole,
  type SessionUser,
} from "@/lib/authz";
import {
  formatCurrency,
  formatGregorianDate,
  formatNumber,
} from "@/lib/format";
import { NOINDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NOINDEX_METADATA;
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
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

  const [data, locale, messages] = await Promise.all([
    listReportMonthsForTenant(user),
    getAppLocale(),
    getAppMessages(),
  ]);

  const t = createTranslator({ locale, messages, namespace: "reports" });
  const isRtl = locale === "ar";

  return (
    <AppShell variant="manager" user={user}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground">
              {t("title")}
            </h1>
            <Badge variant="outline">
              {locale === "ar" ? data.restaurant.nameAr : data.restaurant.name}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <BaselineSettingsCard
          key={`${data.baselineWindow.startDate}:${data.baselineWindow.endDate}:${String(data.baselineWindow.isCustom)}`}
          baselineWindow={data.baselineWindow}
        />

        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <FileBarChart2 className="size-5 text-primary" />
            <span>{t("list.monthsHeading")}</span>
          </h2>

          {data.months.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {t("list.empty")}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.months.map((m) => {
                const monthLabel = formatGregorianDate(
                  `${m.yearMonth}-15T12:00:00.000Z`,
                  locale,
                  { year: "numeric", month: "long", day: undefined },
                );
                const badgeVariant =
                  m.savings.outcome === "SAVED"
                    ? "default"
                    : m.savings.outcome === "INCREASED"
                      ? "destructive"
                      : "secondary";

                return (
                  <Card key={m.yearMonth} className="flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-lg">{monthLabel}</CardTitle>
                          <CardDescription className="tabular-nums">
                            {m.monthStartDate} – {m.monthEndDate} ·{" "}
                            {t("list.entriesCount", {
                              count: formatNumber(m.wasteEntryCount, locale),
                            })}
                          </CardDescription>
                        </div>
                        <Badge variant={badgeVariant}>
                          {t(`list.statusBadges.${m.savings.outcome}`)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/20 p-3">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {t("list.wasteTotalLabel")}
                          </p>
                          <p className="mt-0.5 text-base font-semibold tabular-nums">
                            {formatCurrency(m.wasteSar, locale)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {t("detail.estimateBadge")}
                          </p>
                          <p
                            className={`mt-0.5 text-base font-bold tabular-nums ${
                              m.savings.outcome === "SAVED"
                                ? "text-primary"
                                : m.savings.outcome === "INCREASED"
                                  ? "text-destructive"
                                  : "text-foreground"
                            }`}
                          >
                            {m.savings.outcome === "CALIBRATING"
                              ? t("detail.hero.calibratingSentence", {
                                  days: m.savings.calibratingDaysLeft,
                                })
                              : m.savings.outcome === "INCREASED"
                                ? t("detail.hero.increasedSentence", {
                                    amount: formatCurrency(
                                      m.savings.headlineAmountSar,
                                      locale,
                                    ),
                                  })
                                : formatCurrency(
                                    m.savings.headlineAmountSar,
                                    locale,
                                  )}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {m.savings.method === "VOLUME_ADJUSTED"
                            ? t("list.volumeMethodBadge")
                            : t("list.rawMethodBadge")}
                        </span>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button asChild variant="outline" size="sm" className="gap-1.5">
                            <a
                              href={`/api/reports/${m.yearMonth}/csv?locale=${locale}`}
                              download={`wafrah-report-${m.yearMonth}.csv`}
                            >
                              <Download className="size-3.5" />
                              <span>{t("list.downloadCsv")}</span>
                            </a>
                          </Button>
                          <Button asChild size="sm" className="gap-1.5">
                            <Link href={`/reports/${m.yearMonth}`}>
                              <span>{t("list.openReport")}</span>
                              {isRtl ? (
                                <ArrowLeft className="size-3.5" />
                              ) : (
                                <ArrowRight className="size-3.5" />
                              )}
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
