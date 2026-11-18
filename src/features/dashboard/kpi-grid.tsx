import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Minus,
  Percent,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppLocale, getAppTranslations } from "@/i18n/request";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChangeDirection, DashboardKpiSummary } from "./types";

interface KpiGridProps {
  kpis: DashboardKpiSummary;
}

function DeltaPill({
  direction,
  label,
  higherIsBad = true,
}: {
  direction: ChangeDirection;
  label: string;
  higherIsBad?: boolean;
}) {
  const Icon =
    direction === "up"
      ? TrendingUp
      : direction === "down"
        ? TrendingDown
        : Minus;

  const toneClass =
    direction === "flat"
      ? "bg-muted text-muted-foreground"
      : direction === "up"
        ? higherIsBad
          ? "bg-destructive/12 text-destructive"
          : "bg-secondary/15 text-secondary"
        : higherIsBad
          ? "bg-secondary/15 text-secondary"
          : "bg-destructive/12 text-destructive";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        toneClass,
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {label.endsWith("%") ? <bdi dir="ltr">{label}</bdi> : <span>{label}</span>}
    </span>
  );
}

function formatSignedValue(raw: string | null, locale: "ar" | "en", suffix = "%") {
  if (raw === null) return null;
  const num = Number(raw);
  const absFormatted = formatNumber(Math.abs(num), locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const sign = num > 0 ? "+" : num < 0 ? "-" : "";
  return `${sign}${absFormatted}${suffix}`;
}

export async function KpiGrid({ kpis }: KpiGridProps) {
  const locale = await getAppLocale();
  const t = await getAppTranslations("dashboard");
  const tWaste = await getAppTranslations("waste");

  const wastePctLabel =
    formatSignedValue(kpis.wasteCostChangePct, locale) ?? t("kpis.newChange");
  const entryPctLabel =
    formatSignedValue(kpis.entryCountChangePct, locale) ?? t("kpis.newChange");
  const purchaseDeltaRaw = formatSignedValue(
    kpis.purchasePctChangePts,
    locale,
    "",
  );
  const purchaseDeltaLabel = purchaseDeltaRaw
    ? t("kpis.ptsDelta", { pts: `\u2066${purchaseDeltaRaw}\u2069` })
    : t("kpis.newChange");

  return (
    <section
      aria-label={t("kpis.wasteCostTitle")}
      data-testid="dashboard-kpi-grid"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <Card data-testid="kpi-waste-cost" className="min-w-0 text-start">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("kpis.wasteCostTitle")}
          </CardTitle>
          <Wallet className="size-4 text-primary" />
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {formatCurrency(kpis.totalWasteSar, locale)}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <DeltaPill
              direction={kpis.wasteCostDirection}
              label={wastePctLabel}
            />
            <span>{t("kpis.wasteCostSub", { days: kpis.rangeDays })}</span>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="kpi-waste-pct-purchases" className="min-w-0 text-start">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("kpis.wastePctPurchasesTitle")}
          </CardTitle>
          <Percent className="size-4 text-primary" />
        </CardHeader>
        <CardContent className="space-y-2">
          {kpis.hasPurchaseData && kpis.wasteAsPctOfPurchases !== null ? (
            <>
              <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {formatNumber(kpis.wasteAsPctOfPurchases, locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
                %
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <DeltaPill
                  direction={kpis.purchasePctDirection}
                  label={purchaseDeltaLabel}
                />
                <span>{t("kpis.wastePctPurchasesSub")}</span>
              </div>
            </>
          ) : (
            <div className="space-y-2 pt-0.5">
              <p className="text-sm font-medium text-muted-foreground">
                {t("kpis.importPurchasesPrompt")}
              </p>
              <Link
                href="/imports"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <span>{t("kpis.importPurchasesLink")}</span>
                <ArrowRight className="size-3.5 rtl-flip" />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="kpi-waste-entries" className="min-w-0 text-start">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("kpis.entriesCountTitle")}
          </CardTitle>
          <ClipboardList className="size-4 text-primary" />
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {formatNumber(kpis.wasteEntryCount, locale, {
              maximumFractionDigits: 0,
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <DeltaPill
              direction={kpis.entryCountDirection}
              label={entryPctLabel}
            />
            <span>{t("kpis.entriesCountSub", { days: kpis.rangeDays })}</span>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="kpi-top-reason" className="min-w-0 text-start">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("kpis.topReasonTitle")}
          </CardTitle>
          <AlertTriangle className="size-4 text-accent" />
        </CardHeader>
        <CardContent className="space-y-2">
          {kpis.topReason ? (
            <>
              <div className="truncate text-xl font-bold tracking-tight text-foreground">
                {tWaste(`reasons.${kpis.topReason.reason}`)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                <span className="font-semibold text-primary">
                  {formatCurrency(kpis.topReason.sarCost, locale)}
                </span>
                <span>
                  {t("kpis.topReasonShare", {
                    pct: formatNumber(kpis.topReason.sharePct, locale, {
                      maximumFractionDigits: 1,
                    }),
                  })}
                </span>
              </div>
            </>
          ) : (
            <p className="pt-1 text-sm font-medium text-muted-foreground">
              {t("kpis.noDataYet")}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
