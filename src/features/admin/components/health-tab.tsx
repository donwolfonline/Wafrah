"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatGregorianDate,
  formatNumber,
  type SupportedLocale,
} from "@/lib/format";
import type { AdminHealthSnapshot, CronRunStatus } from "../types";

interface HealthTabProps {
  health: AdminHealthSnapshot;
}

function getCronStatusBadgeVariant(
  status: CronRunStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "OK":
      return "default";
    case "PARTIAL":
      return "secondary";
    case "FAILED":
      return "destructive";
    default:
      return "outline";
  }
}

export function HealthTab({ health }: HealthTabProps) {
  const t = useTranslations("admin");
  const locale = useLocale() as SupportedLocale;

  const maxDailyEntries = Math.max(
    1,
    ...health.dailyEntries.map((point) => point.entryCount),
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="text-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-primary">
              <Clock className="size-4 text-accent" />
              <span>{t("health.cronTitle")}</span>
            </CardTitle>
            <CardDescription>{t("health.cronSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {health.cronJobs.map((job) => (
              <div
                key={job.job}
                data-testid={`cron-job-${job.job}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium text-foreground">
                    {t(`health.cronJobs.${job.job}`)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("health.cronLastRun")}:{" "}
                    {job.lastRunAt
                      ? formatGregorianDate(job.lastRunAt, locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : t("table.none")}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {job.tenantCount !== null ? (
                    <span className="text-xs text-muted-foreground">
                      {t("health.cronTenants")}:{" "}
                      {formatNumber(job.tenantsSucceeded ?? 0, locale)}/
                      {formatNumber(job.tenantCount, locale)}
                    </span>
                  ) : null}
                  {job.totalEmailsSent !== null ? (
                    <span className="text-xs text-muted-foreground">
                      {t("health.cronEmails")}:{" "}
                      {formatNumber(job.totalEmailsSent, locale)}
                    </span>
                  ) : null}
                  <Badge variant={getCronStatusBadgeVariant(job.status)}>
                    {t(`health.cronStatus.${job.status}`)}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="text-start">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-primary">
              {t("health.dailyTitle")}
            </CardTitle>
            <CardDescription>{t("health.dailySubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {health.dailyEntries.map((day) => {
                const widthPct = Math.round(
                  (day.entryCount / maxDailyEntries) * 100,
                );
                return (
                  <div
                    key={day.dateKey}
                    className="grid grid-cols-[68px_1fr_auto] items-center gap-2 text-xs sm:grid-cols-[96px_1fr_auto] sm:gap-3"
                  >
                    <span className="text-muted-foreground">
                      {formatGregorianDate(`${day.dateKey}T12:00:00.000Z`, locale, {
                        year: undefined,
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-secondary transition-all"
                        style={{ width: `${day.entryCount > 0 ? Math.max(4, widthPct) : 0}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <span>{formatNumber(day.entryCount, locale)}</span>
                      <span className="text-muted-foreground">
                        ({formatNumber(day.tenantCount, locale)})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="text-start">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-primary">
            {health.flaggedWapeCount > 0 ? (
              <AlertTriangle className="size-4 text-destructive" />
            ) : (
              <CheckCircle2 className="size-4 text-secondary" />
            )}
            <span>{t("health.wapeTitle")}</span>
          </CardTitle>
          <CardDescription>
            {t("health.wapeSubtitle", {
              threshold: formatNumber(health.wapeThresholdPct, locale),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {health.forecastAccuracy.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("health.wapeEmpty")}
            </p>
          ) : (
            <div className="md:overflow-x-auto">
              <Table className="block md:table">
                <TableHeader className="hidden md:table-header-group">
                  <TableRow>
                    <TableHead className="text-start">
                      {t("table.restaurant")}
                    </TableHead>
                    <TableHead className="text-start">
                      {t("health.evaluationsCount")}
                    </TableHead>
                    <TableHead className="text-start">WAPE</TableHead>
                    <TableHead className="text-start">
                      {t("health.latestEvaluation")}
                    </TableHead>
                    <TableHead className="text-start">
                      {t("table.status")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="block space-y-3 md:table-row-group md:space-y-0">
                  {health.forecastAccuracy.map((row) => (
                    <TableRow
                      key={row.tenantId}
                      data-testid={`wape-row-${row.code}`}
                      data-flagged={row.flaggedHighWape ? "true" : "false"}
                      className="block rounded-xl border bg-card p-3.5 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:p-0"
                    >
                      <TableCell className="block border-b border-border/60 px-0 pt-0 pb-2 md:table-cell md:border-b-0 md:px-2 md:py-2">
                        <div className="font-medium text-foreground">
                          {locale === "ar" ? row.nameAr : row.name}
                        </div>
                        <div dir="ltr" className="font-mono text-xs text-muted-foreground text-start">
                          {row.code}
                        </div>
                      </TableCell>
                      <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 text-sm md:table-cell md:px-2 md:py-2">
                        <span className="text-xs font-medium text-muted-foreground md:hidden">
                          {t("health.evaluationsCount")}
                        </span>
                        <span>{formatNumber(row.evaluationCount, locale)}</span>
                      </TableCell>
                      <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 font-semibold md:table-cell md:px-2 md:py-2">
                        <span className="text-xs font-medium text-muted-foreground md:hidden">
                          WAPE
                        </span>
                        <span>
                          {row.averageWapePct !== null
                            ? `${formatNumber(row.averageWapePct, locale, {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}%`
                            : t("table.none")}
                        </span>
                      </TableCell>
                      <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 text-xs text-muted-foreground md:table-cell md:px-2 md:py-2">
                        <span className="font-medium md:hidden">
                          {t("health.latestEvaluation")}
                        </span>
                        <span>
                          {row.latestEvaluatedAt
                            ? formatGregorianDate(row.latestEvaluatedAt, locale)
                            : t("table.none")}
                        </span>
                      </TableCell>
                      <TableCell className="flex items-center justify-between gap-2 px-0 pt-1.5 pb-0 md:table-cell md:px-2 md:py-2">
                        <span className="text-xs font-medium text-muted-foreground md:hidden">
                          {t("table.status")}
                        </span>
                        {row.averageWapePct === null ? (
                          <Badge variant="outline">{t("health.wapeNoData")}</Badge>
                        ) : row.flaggedHighWape ? (
                          <Badge variant="destructive">
                            {t("health.wapeFlagged", {
                              threshold: formatNumber(
                                health.wapeThresholdPct,
                                locale,
                              ),
                            })}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{t("health.wapeOk")}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
