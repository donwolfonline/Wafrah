"use client";

import type { SubscriptionStatus } from "@prisma/client";
import { Ban, Pencil, RotateCcw, Stethoscope, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { AdminCustomerSummary } from "../types";

interface CustomersTableProps {
  customers: AdminCustomerSummary[];
  pendingSuspendId: string | null;
  onEditSubscription: (customer: AdminCustomerSummary) => void;
  onToggleSuspension: (customer: AdminCustomerSummary) => void;
  onOpenDiagnostics: (customer: AdminCustomerSummary) => void;
  onRequestDelete: (customer: AdminCustomerSummary) => void;
}

function getStatusBadgeVariant(
  status: SubscriptionStatus | null,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ACTIVE":
      return "default";
    case "TRIAL":
      return "secondary";
    case "SUSPENDED":
    case "CANCELLED":
      return "destructive";
    default:
      return "outline";
  }
}

export function CustomersTable({
  customers,
  pendingSuspendId,
  onEditSubscription,
  onToggleSuspension,
  onOpenDiagnostics,
  onRequestDelete,
}: CustomersTableProps) {
  const t = useTranslations("admin");
  const locale = useLocale() as SupportedLocale;

  return (
    <Card className="min-w-0">
      <CardContent className="p-0">
        <Table
          data-testid="admin-customers-table"
          className="block md:table"
        >
          <TableHeader className="hidden md:table-header-group">
            <TableRow>
              <TableHead className="px-3 text-start">
                {t("table.restaurant")}
              </TableHead>
              <TableHead className="px-2.5 text-start">
                {t("table.city")}
              </TableHead>
              <TableHead className="px-2.5 text-start">
                {t("table.plan")}
              </TableHead>
              <TableHead className="px-2.5 text-start">
                {t("table.status")}
              </TableHead>
              <TableHead className="px-2.5 text-start whitespace-nowrap">
                {t("table.renewsAt")}
              </TableHead>
              <TableHead className="px-2.5 text-start whitespace-nowrap">
                {t("table.users")}
              </TableHead>
              <TableHead className="px-2.5 text-start whitespace-nowrap">
                {t("table.lastActivity")}
              </TableHead>
              <TableHead className="px-2.5 text-start whitespace-nowrap">
                {t("table.entries7d")}
              </TableHead>
              <TableHead className="px-3 text-end">
                {t("table.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="block space-y-3 p-3 md:table-row-group md:space-y-0 md:p-0">
            {customers.length === 0 ? (
              <TableRow className="block md:table-row">
                <TableCell
                  colSpan={9}
                  className="block py-8 text-center text-sm text-muted-foreground md:table-cell"
                >
                  {t("table.empty")}
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => {
                const isSuspended = customer.status === "SUSPENDED";
                return (
                  <TableRow
                    key={customer.id}
                    data-testid={`customer-row-${customer.code}`}
                    data-status={customer.status ?? ""}
                    className="block rounded-xl border bg-card p-3.5 shadow-2xs md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:p-0 md:shadow-none"
                  >
                    <TableCell className="block max-w-none border-b border-border/60 px-0 pt-0 pb-2.5 text-start md:table-cell md:max-w-[210px] md:border-b-0 md:px-3 md:py-3">
                      <div className="truncate font-semibold text-foreground">
                        {locale === "ar" ? customer.nameAr : customer.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {locale === "ar" ? customer.name : customer.nameAr}
                      </div>
                      <div
                        dir="ltr"
                        className="mt-0.5 truncate font-mono text-[11px] text-secondary text-start"
                      >
                        {customer.code} · {customer.type}
                      </div>
                    </TableCell>

                    <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 text-xs whitespace-nowrap text-start md:table-cell md:px-2.5 md:py-3">
                      <span className="font-medium text-muted-foreground md:hidden">
                        {t("table.city")}
                      </span>
                      <span>{customer.city}</span>
                    </TableCell>

                    <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 text-start whitespace-nowrap md:table-cell md:px-2.5 md:py-3">
                      <span className="text-xs font-medium text-muted-foreground md:hidden">
                        {t("table.plan")}
                      </span>
                      {customer.plan ? (
                        <Badge variant="outline">
                          {t(`plans.${customer.plan}`)}
                        </Badge>
                      ) : (
                        t("table.none")
                      )}
                    </TableCell>

                    <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 text-start whitespace-nowrap md:table-cell md:px-2.5 md:py-3">
                      <span className="text-xs font-medium text-muted-foreground md:hidden">
                        {t("table.status")}
                      </span>
                      {customer.status ? (
                        <Badge variant={getStatusBadgeVariant(customer.status)}>
                          {t(`statuses.${customer.status}`)}
                        </Badge>
                      ) : (
                        t("table.none")
                      )}
                    </TableCell>

                    <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 text-xs whitespace-nowrap text-muted-foreground text-start md:table-cell md:px-2.5 md:py-3">
                      <span className="font-medium md:hidden">
                        {t("table.renewsAt")}
                      </span>
                      <span>
                        {customer.renewsAt
                          ? formatGregorianDate(customer.renewsAt, locale)
                          : t("table.none")}
                      </span>
                    </TableCell>

                    <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 text-xs whitespace-nowrap text-start md:table-cell md:px-2.5 md:py-3">
                      <span className="font-medium text-muted-foreground md:hidden">
                        {t("table.users")}
                      </span>
                      <span>{formatNumber(customer.userCount, locale)}</span>
                    </TableCell>

                    <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 text-xs whitespace-nowrap text-muted-foreground text-start md:table-cell md:px-2.5 md:py-3">
                      <span className="font-medium md:hidden">
                        {t("table.lastActivity")}
                      </span>
                      <span>
                        {customer.lastActivityAt
                          ? formatGregorianDate(customer.lastActivityAt, locale)
                          : t("table.never")}
                      </span>
                    </TableCell>

                    <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 text-xs font-medium whitespace-nowrap text-start md:table-cell md:px-2.5 md:py-3">
                      <span className="text-muted-foreground md:hidden">
                        {t("table.entries7d")}
                      </span>
                      <span>{formatNumber(customer.entriesLast7Days, locale)}</span>
                    </TableCell>

                    <TableCell className="block border-t border-border/60 px-0 pt-2.5 pb-0 text-end md:table-cell md:border-t-0 md:px-3 md:py-3">
                      <div className="grid grid-cols-2 gap-1.5 md:flex md:flex-wrap md:justify-end md:gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onEditSubscription(customer)}
                          data-testid={`edit-sub-${customer.code}`}
                          className="h-8 gap-1 px-2 text-xs md:h-7"
                        >
                          <Pencil className="size-3 shrink-0" />
                          <span className="truncate">{t("actions.editSubscription")}</span>
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant={isSuspended ? "secondary" : "destructive"}
                          disabled={pendingSuspendId === customer.id}
                          onClick={() => onToggleSuspension(customer)}
                          data-testid={`suspend-toggle-${customer.code}`}
                          className="h-8 gap-1 px-2 text-xs md:h-7"
                        >
                          {isSuspended ? (
                            <RotateCcw className="size-3 shrink-0" />
                          ) : (
                            <Ban className="size-3 shrink-0" />
                          )}
                          <span className="truncate">
                            {isSuspended
                              ? t("actions.reactivate")
                              : t("actions.suspend")}
                          </span>
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onOpenDiagnostics(customer)}
                          data-testid={`diagnostics-${customer.code}`}
                          className="h-8 gap-1 px-2 text-xs md:h-7 md:border-transparent md:bg-transparent md:shadow-none"
                        >
                          <Stethoscope className="size-3 shrink-0" />
                          <span className="truncate">{t("actions.diagnostics")}</span>
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => onRequestDelete(customer)}
                          data-testid={`delete-${customer.code}`}
                          className="h-8 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive md:h-7"
                        >
                          <Trash2 className="size-3 shrink-0" />
                          <span className="truncate">{t("actions.delete")}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
