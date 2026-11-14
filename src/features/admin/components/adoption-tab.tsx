"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { DailyTenantEntriesPoint, TenantAdoptionRow } from "../types";

interface AdoptionTabProps {
  rows: TenantAdoptionRow[];
}

function AdoptionSparkline({
  series,
  ariaLabel,
}: {
  series: DailyTenantEntriesPoint[];
  ariaLabel: string;
}) {
  const maxVal = Math.max(1, ...series.map((p) => p.entryCount));
  const width = 112;
  const height = 28;
  const barWidth = 6;
  const gap = 2;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
    >
      {series.map((point, idx) => {
        const x = idx * (barWidth + gap);
        const isZero = point.entryCount === 0;
        const barHeight = isZero
          ? 2
          : Math.max(4, Math.round((point.entryCount / maxVal) * (height - 4)));
        const y = height - barHeight;
        return (
          <rect
            key={point.dateKey}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={1.5}
            fill={isZero ? "#cbd5e1" : "#047857"}
          >
            <title>{`${point.dateKey}: ${point.entryCount}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function AdoptionTab({ rows }: AdoptionTabProps) {
  const t = useTranslations("admin.adoption");
  const rawLocale = useLocale();
  const locale: SupportedLocale = rawLocale === "en" ? "en" : "ar";

  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const flaggedCount = rows.filter((row) => row.noEntriesIn3Days).length;
  const visibleRows = flaggedOnly
    ? rows.filter((row) => row.noEntriesIn3Days)
    : rows;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {flaggedCount > 0 ? (
            <Badge
              variant="outline"
              className="gap-1 border-amber-300 bg-amber-50 text-amber-900"
            >
              <AlertTriangle className="size-3.5" />
              <span>{t("flaggedCount", { count: flaggedCount })}</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-800"
            >
              <CheckCircle2 className="size-3.5" />
              <span>{t("allGood")}</span>
            </Badge>
          )}

          <Button
            type="button"
            size="sm"
            variant={flaggedOnly ? "default" : "outline"}
            data-testid="adoption-flagged-only-toggle"
            onClick={() => setFlaggedOnly((prev) => !prev)}
          >
            {t("flaggedOnly")}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {visibleRows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.restaurant")}</TableHead>
                <TableHead>{t("columns.sparkline")}</TableHead>
                <TableHead>{t("columns.entries14d")}</TableHead>
                <TableHead>{t("columns.lastEntry")}</TableHead>
                <TableHead>{t("columns.lastLogin")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const displayName = locale === "ar" ? row.nameAr : row.name;
                return (
                  <TableRow
                    key={row.tenantId}
                    data-testid={`adoption-row-${row.code}`}
                  >
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{displayName}</span>
                          <span
                            dir="ltr"
                            className="font-mono text-xs text-muted-foreground"
                          >
                            {row.code}
                          </span>
                        </div>
                        {row.status === "SUSPENDED" ? (
                          <Badge variant="outline" className="w-fit text-xs">
                            {t("suspendedBadge")}
                          </Badge>
                        ) : row.noEntriesIn3Days ? (
                          <Badge
                            variant="outline"
                            className="w-fit gap-1 border-red-300 bg-red-50 text-xs text-red-800"
                          >
                            <AlertTriangle className="size-3" />
                            <span>{t("flagBadge")}</span>
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="w-fit border-emerald-200 bg-emerald-50 text-xs text-emerald-800"
                          >
                            {t("okBadge")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <AdoptionSparkline
                        series={row.dailySeries}
                        ariaLabel={t("sparklineAria", {
                          name: displayName,
                          total: row.entries14d,
                        })}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatNumber(row.entries14d, locale)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lastEntryAt
                        ? formatGregorianDate(row.lastEntryAt, locale, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : t("never")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lastLoginAt
                        ? formatGregorianDate(row.lastLoginAt, locale, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : t("never")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
