"use client";

import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
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
import type { TenantDiagnosticsDto } from "../types";

interface DiagnosticsDetailsProps {
  diagnostics: TenantDiagnosticsDto;
}

export function DiagnosticsDetails({ diagnostics }: DiagnosticsDetailsProps) {
  const t = useTranslations("admin");
  const locale = useLocale() as SupportedLocale;

  const countTiles = [
    {
      label: t("diagnostics.usersCount"),
      value: `${formatNumber(diagnostics.counts.usersActive, locale)} / ${formatNumber(diagnostics.counts.usersTotal, locale)}`,
    },
    {
      label: t("diagnostics.menuItemsCount"),
      value: `${formatNumber(diagnostics.counts.menuItemsActive, locale)} / ${formatNumber(diagnostics.counts.menuItemsTotal, locale)}`,
    },
    {
      label: t("diagnostics.wasteCount"),
      value: formatNumber(diagnostics.counts.wasteEntriesCount, locale),
    },
    {
      label: t("diagnostics.salesCount"),
      value: formatNumber(diagnostics.counts.salesRecordsCount, locale),
    },
    {
      label: t("diagnostics.purchasesCount"),
      value: formatNumber(diagnostics.counts.purchaseRecordsCount, locale),
    },
    {
      label: t("diagnostics.forecastsCount"),
      value: formatNumber(diagnostics.counts.forecastResultsCount, locale),
    },
    {
      label: t("diagnostics.alertsCount"),
      value: `${formatNumber(diagnostics.counts.alertsUnreadCount, locale)} / ${formatNumber(diagnostics.counts.alertsTotalCount, locale)}`,
      wide: true,
    },
  ];

  return (
    <div className="space-y-5 text-start" data-testid="diagnostics-content">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {t("diagnostics.countsTitle")}
        </h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {countTiles.map((tile) => (
            <div
              key={tile.label}
              className={`rounded-md border bg-card p-2.5 ${tile.wide ? "col-span-2" : ""}`}
            >
              <div className="text-xs text-muted-foreground">{tile.label}</div>
              <div className="mt-0.5 text-sm font-semibold">{tile.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {t("diagnostics.importsTitle")}
        </h3>
        {diagnostics.lastImports.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("diagnostics.importsEmpty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">
                    {t("diagnostics.importType")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("diagnostics.importFile")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("diagnostics.importRows")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("diagnostics.importDate")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagnostics.lastImports.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <Badge variant="outline">{batch.type}</Badge>
                    </TableCell>
                    <TableCell
                      dir="ltr"
                      className="max-w-44 truncate text-xs text-start"
                    >
                      {batch.fileName}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatNumber(batch.rowsImported, locale)} /{" "}
                      {formatNumber(batch.rowsRejected, locale)} /{" "}
                      {formatNumber(batch.rowsDuplicate, locale)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatGregorianDate(batch.createdAt, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          {t("diagnostics.alertsTitle")}
        </h3>
        {diagnostics.lastAlerts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("diagnostics.alertsEmpty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">
                    {t("diagnostics.alertSeverity")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("diagnostics.alertKey")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("diagnostics.alertStatus")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("diagnostics.alertCreated")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagnostics.lastAlerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <Badge
                        variant={
                          alert.severity === "CRITICAL"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell
                      dir="ltr"
                      className="font-mono text-xs text-start"
                    >
                      {alert.messageKey}
                    </TableCell>
                    <TableCell className="text-xs">{alert.status}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatGregorianDate(alert.createdAt, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
