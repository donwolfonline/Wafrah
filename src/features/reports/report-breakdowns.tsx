import { createTranslator } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale, AppMessages } from "@/i18n/request";
import { formatAlertMessageText } from "@/lib/alert-format";
import { formatCurrency, formatGregorianDate, formatNumber } from "@/lib/format";
import { formatSuggestedActionText } from "./action-text";
import { SignedMetricText } from "./signed-metric";
import type { MonthlyReportData } from "./types";

interface ReportBreakdownsProps {
  report: MonthlyReportData;
  locale: AppLocale;
  messages: AppMessages;
}

export function ReportBreakdowns({
  report,
  locale,
  messages,
}: ReportBreakdownsProps) {
  const tSec = createTranslator({
    locale,
    messages,
    namespace: "reports.detail.sections",
  });
  const tWaste = createTranslator({ locale, messages, namespace: "waste" });
  const tDashboard = createTranslator({
    locale,
    messages,
    namespace: "dashboard",
  });
  const tAlertBody = createTranslator({
    locale,
    messages,
    namespace: "insights.alerts",
  });

  const comparisonStrip = [
    {
      label: tSec("wasteVsBaseline.baselineWeekly"),
      value: formatCurrency(report.savings.baseline.weeklyWasteSar, locale),
    },
    {
      label: tSec("wasteVsBaseline.currentWeekly"),
      value: formatCurrency(report.savings.current.weeklyWasteSar, locale),
    },
    {
      label: tSec("wasteVsBaseline.expectedTotal"),
      value: formatCurrency(report.savings.expectedWasteAtBaselineSar, locale),
    },
    {
      label: tSec("wasteVsBaseline.actualTotal"),
      value: formatCurrency(report.savings.current.totalWasteSar, locale),
    },
    {
      label: tSec("wasteVsBaseline.variance"),
      value: (
        <SignedMetricText
          value={report.savings.varianceSar}
          locale={locale}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5 print:space-y-3">
      <Card className="print-avoid-break">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tSec("wasteVsBaseline.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 print:grid-cols-5">
            {comparisonStrip.map((tile) => (
              <div key={tile.label} className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">{tile.label}</p>
                <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
                  {tile.value}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="print-avoid-break">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tSec("actions.title")}</CardTitle>
          <CardDescription>{tSec("actions.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {report.suggestedActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tSec("actions.empty")}</p>
          ) : (
            <ol className="space-y-2.5">
              {report.suggestedActions.map((action, idx) => (
                <li
                  key={action.id}
                  className="flex items-start gap-3 rounded-md border bg-muted/15 p-3 text-sm"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="leading-relaxed text-foreground">
                    {formatSuggestedActionText(action, locale, messages)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card className="print-avoid-break">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tSec("topItems.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {report.topItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tSec("topItems.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 pe-3 text-start font-medium">{tSec("topItems.columns.item")}</th>
                    <th className="px-3 py-2 text-start font-medium">{tSec("topItems.columns.qty")}</th>
                    <th className="px-3 py-2 text-start font-medium">{tSec("topItems.columns.cost")}</th>
                    <th className="px-3 py-2 text-start font-medium">{tSec("topItems.columns.share")}</th>
                    <th className="py-2 ps-3 text-start font-medium">{tSec("topItems.columns.entries")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topItems.map((item) => (
                    <tr key={item.menuItemId} className="border-b border-border/60 last:border-b-0">
                      <td className="py-2 pe-3 font-medium">
                        {locale === "ar" ? item.nameAr : item.name}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatNumber(item.wasteQty, locale, { maximumFractionDigits: 2 })}{" "}
                        {tWaste(`units.${item.unit}`)}
                      </td>
                      <td className="px-3 py-2 font-medium tabular-nums">
                        {formatCurrency(item.wasteSar, locale)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatNumber(item.sharePct, locale, { maximumFractionDigits: 1 })}%
                      </td>
                      <td className="py-2 ps-3 tabular-nums">
                        {formatNumber(item.entryCount, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="print-avoid-break">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tSec("topReasons.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {report.topReasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tSec("topReasons.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 pe-3 text-start font-medium">{tSec("topReasons.columns.reason")}</th>
                    <th className="px-3 py-2 text-start font-medium">{tSec("topReasons.columns.cost")}</th>
                    <th className="px-3 py-2 text-start font-medium">{tSec("topReasons.columns.share")}</th>
                    <th className="py-2 ps-3 text-start font-medium">{tSec("topReasons.columns.entries")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topReasons.map((row) => (
                    <tr key={row.reason} className="border-b border-border/60 last:border-b-0">
                      <td className="py-2 pe-3 font-medium">{tWaste(`reasons.${row.reason}`)}</td>
                      <td className="px-3 py-2 font-medium tabular-nums">{formatCurrency(row.sarCost, locale)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatNumber(row.sharePct, locale, { maximumFractionDigits: 1 })}%
                      </td>
                      <td className="py-2 ps-3 tabular-nums">{formatNumber(row.entryCount, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {report.adherence.derivable && (
        <Card className="print-avoid-break">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{tSec("adherence.title")}</CardTitle>
            <CardDescription>
              {tSec("adherence.description", { tol: report.adherence.tolerancePct })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{tSec("adherence.pairedDays")}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(report.adherence.pairedDays, locale)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{tSec("adherence.followed")}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-primary">{formatNumber(report.adherence.followedCount, locale)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{tSec("adherence.ignored")}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-destructive">{formatNumber(report.adherence.ignoredCount, locale)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{tSec("adherence.adherenceRate")}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {report.adherence.adherencePct ? `${formatNumber(report.adherence.adherencePct, locale)}%` : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="print-avoid-break">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tSec("alerts.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {report.alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tSec("alerts.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 pe-3 text-start font-medium">{tSec("alerts.columns.severity")}</th>
                    <th className="px-3 py-2 text-start font-medium">{tSec("alerts.columns.message")}</th>
                    <th className="px-3 py-2 text-start font-medium">{tSec("alerts.columns.date")}</th>
                    <th className="py-2 ps-3 text-start font-medium">{tSec("alerts.columns.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.alerts.map((alert) => (
                    <tr key={alert.id} className="border-b border-border/60 last:border-b-0">
                      <td className="py-2 pe-3 align-top">
                        <Badge variant={alert.severity === "CRITICAL" ? "destructive" : "secondary"}>
                          {tDashboard(`alerts.severity.${alert.severity}`)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 align-top leading-relaxed">
                        {formatAlertMessageText({
                          messageKey: alert.messageKey,
                          messageParams: alert.messageParams,
                          locale,
                          tAlertBody: (key, values) => tAlertBody(key, values),
                          tUnits: (unit) => tWaste(`units.${unit}`),
                        })}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatGregorianDate(alert.createdAtIso, locale)}
                      </td>
                      <td className="py-2 ps-3 align-top whitespace-nowrap text-xs text-muted-foreground">
                        {tSec(`alerts.statusLabels.${alert.status}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
