import { AlertTriangle, Calculator, CheckCircle2, Clock, Minus } from "lucide-react";
import { createTranslator } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AppLocale, AppMessages } from "@/i18n/request";
import { formatCurrency, formatGregorianDate, formatNumber } from "@/lib/format";
import { SignedMetricText } from "./signed-metric";
import type { SavingsEstimateResult } from "./types";

interface ReportSavingsHeroProps {
  savings: SavingsEstimateResult;
  locale: AppLocale;
  messages: AppMessages;
}

function fmtDateRange(start: string, end: string, locale: AppLocale): string {
  const s = formatGregorianDate(`${start}T12:00:00.000Z`, locale);
  const e = formatGregorianDate(`${end}T12:00:00.000Z`, locale);
  return `${s} – ${e}`;
}

export function ReportSavingsHero({
  savings,
  locale,
  messages,
}: ReportSavingsHeroProps) {
  const t = createTranslator({ locale, messages, namespace: "reports.detail" });
  const notAvailable = t("howCalculated.rows.notAvailable");

  const outcomeStyle = {
    SAVED: {
      card: "border-primary/40 bg-primary/5",
      amount: "text-primary",
      icon: CheckCircle2,
      title: t("hero.savedTitle"),
    },
    INCREASED: {
      card: "border-destructive/40 bg-destructive/5",
      amount: "text-destructive",
      icon: AlertTriangle,
      title: t("hero.increasedTitle"),
    },
    CALIBRATING: {
      card: "border-accent bg-accent/15",
      amount: "text-foreground",
      icon: Clock,
      title: t("hero.calibratingTitle"),
    },
    FLAT: {
      card: "border-border bg-muted/30",
      amount: "text-foreground",
      icon: Minus,
      title: t("hero.flatTitle"),
    },
  }[savings.outcome];

  const Icon = outcomeStyle.icon;

  const comparisonRows = [
    {
      label: t("howCalculated.rows.periodDates"),
      baseline: fmtDateRange(savings.baseline.startDate, savings.baseline.endDate, locale),
      current: fmtDateRange(savings.current.startDate, savings.current.endDate, locale),
    },
    {
      label: t("howCalculated.rows.daysWeeks"),
      baseline: t("howCalculated.rows.daysWeeksValue", {
        days: formatNumber(savings.baseline.days, locale),
        weeks: formatNumber(savings.baseline.weeks, locale, { maximumFractionDigits: 2 }),
      }),
      current: t("howCalculated.rows.daysWeeksValue", {
        days: formatNumber(savings.current.days, locale),
        weeks: formatNumber(savings.current.weeks, locale, { maximumFractionDigits: 2 }),
      }),
    },
    {
      label: t("howCalculated.rows.totalWaste"),
      baseline: formatCurrency(savings.baseline.totalWasteSar, locale),
      current: formatCurrency(savings.current.totalWasteSar, locale),
    },
    {
      label: t("howCalculated.rows.weeklyWaste"),
      baseline: formatCurrency(savings.baseline.weeklyWasteSar, locale),
      current: formatCurrency(savings.current.weeklyWasteSar, locale),
    },
    {
      label: t("howCalculated.rows.unitsSold"),
      baseline:
        savings.baseline.salesRecordCount > 0
          ? formatNumber(savings.baseline.unitsSold, locale, { maximumFractionDigits: 1 })
          : notAvailable,
      current:
        savings.current.salesRecordCount > 0
          ? formatNumber(savings.current.unitsSold, locale, { maximumFractionDigits: 1 })
          : notAvailable,
    },
    {
      label: t("howCalculated.rows.sarPerUnit"),
      baseline: savings.baseline.sarPerUnit
        ? formatCurrency(savings.baseline.sarPerUnit, locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
          })
        : notAvailable,
      current: savings.current.sarPerUnit
        ? formatCurrency(savings.current.sarPerUnit, locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
          })
        : notAvailable,
    },
    {
      label: t("howCalculated.rows.expectedWaste"),
      baseline: "—",
      current: formatCurrency(savings.expectedWasteAtBaselineSar, locale),
    },
    {
      label: t("howCalculated.rows.rawWeeklyResult"),
      baseline: "—",
      current: (
        <SignedMetricText value={savings.rawWeeklySavingsSar} locale={locale} />
      ),
    },
  ];

  return (
    <div className="space-y-5 print:space-y-3 print-avoid-break">
      <Card className={outcomeStyle.card}>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Icon className={`size-5 ${outcomeStyle.amount}`} />
                <h2 className="text-lg font-semibold text-foreground">
                  {outcomeStyle.title}
                </h2>
                <Badge variant="outline" className="border-primary font-semibold text-primary">
                  {t("estimateBadge")}
                </Badge>
              </div>

              {savings.outcome === "CALIBRATING" ? (
                <p className="text-xl font-bold text-foreground">
                  {t("hero.calibratingSentence", {
                    days: savings.calibratingDaysLeft,
                  })}
                </p>
              ) : savings.outcome === "INCREASED" ? (
                <p className="text-2xl font-bold text-destructive tabular-nums">
                  {t("hero.increasedSentence", {
                    amount: formatCurrency(savings.headlineAmountSar, locale),
                  })}
                </p>
              ) : savings.outcome === "FLAT" ? (
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {t("hero.flatSentence")}
                </p>
              ) : (
                <p className="text-3xl font-bold text-primary tabular-nums">
                  {formatCurrency(savings.headlineAmountSar, locale)}
                </p>
              )}

              <p className="text-sm text-muted-foreground">
                {t("hero.estimateDisclaimer")}
              </p>
            </div>

            {savings.variancePct !== null && savings.status === "READY" && (
              <div className="rounded-md border bg-background px-3.5 py-2 text-start">
                <p className="text-xs text-muted-foreground">
                  {t("howCalculated.methodLabel")}
                </p>
                <p className="text-sm font-medium text-foreground">
                  {t(`howCalculated.methods.${savings.method}`)}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
                  <SignedMetricText
                    value={savings.variancePct!}
                    locale={locale}
                    kind="percent"
                  />
                  <span>{t("hero.vsExpectedLabel")}</span>
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="print-avoid-break">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calculator className="size-4 text-primary" />
            <CardTitle className="text-base">{t("howCalculated.title")}</CardTitle>
          </div>
          <CardDescription>
            {savings.method === "VOLUME_ADJUSTED"
              ? t("howCalculated.formulaVolume")
              : t("howCalculated.formulaRaw")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {savings.status === "READY" && savings.isZeroBaseline && (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {t("howCalculated.zeroBaselineNote")}
            </p>
          )}
          {savings.status === "READY" && !savings.hasSalesForBothPeriods && (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {t("howCalculated.noSalesFallbackNote")}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pe-4 text-start font-medium">
                    {t("howCalculated.columns.metric")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("howCalculated.columns.baseline")}
                  </th>
                  <th className="py-2 ps-3 text-start font-medium">
                    {t("howCalculated.columns.current")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="border-b border-border/60 last:border-b-0">
                    <td className="py-2 pe-4 font-medium text-foreground">
                      {row.label}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {row.baseline}
                    </td>
                    <td className="py-2 ps-3 tabular-nums text-foreground">
                      {row.current}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
