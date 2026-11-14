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
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table data-testid="admin-customers-table">
            <TableHeader>
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
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-8 text-center text-sm text-muted-foreground"
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
                    >
                      <TableCell className="max-w-[210px] px-3 py-3 text-start">
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

                      <TableCell className="px-2.5 py-3 text-xs whitespace-nowrap text-start">
                        {customer.city}
                      </TableCell>

                      <TableCell className="px-2.5 py-3 text-start whitespace-nowrap">
                        {customer.plan ? (
                          <Badge variant="outline">
                            {t(`plans.${customer.plan}`)}
                          </Badge>
                        ) : (
                          t("table.none")
                        )}
                      </TableCell>

                      <TableCell className="px-2.5 py-3 text-start whitespace-nowrap">
                        {customer.status ? (
                          <Badge variant={getStatusBadgeVariant(customer.status)}>
                            {t(`statuses.${customer.status}`)}
                          </Badge>
                        ) : (
                          t("table.none")
                        )}
                      </TableCell>

                      <TableCell className="px-2.5 py-3 text-xs whitespace-nowrap text-muted-foreground text-start">
                        {customer.renewsAt
                          ? formatGregorianDate(customer.renewsAt, locale)
                          : t("table.none")}
                      </TableCell>

                      <TableCell className="px-2.5 py-3 text-xs whitespace-nowrap text-start">
                        {formatNumber(customer.userCount, locale)}
                      </TableCell>

                      <TableCell className="px-2.5 py-3 text-xs whitespace-nowrap text-muted-foreground text-start">
                        {customer.lastActivityAt
                          ? formatGregorianDate(customer.lastActivityAt, locale)
                          : t("table.never")}
                      </TableCell>

                      <TableCell className="px-2.5 py-3 text-xs font-medium whitespace-nowrap text-start">
                        {formatNumber(customer.entriesLast7Days, locale)}
                      </TableCell>

                      <TableCell className="px-3 py-3 text-end">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onEditSubscription(customer)}
                            data-testid={`edit-sub-${customer.code}`}
                            className="h-7 gap-1 px-2 text-xs"
                          >
                            <Pencil className="size-3" />
                            <span>{t("actions.editSubscription")}</span>
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant={isSuspended ? "secondary" : "destructive"}
                            disabled={pendingSuspendId === customer.id}
                            onClick={() => onToggleSuspension(customer)}
                            data-testid={`suspend-toggle-${customer.code}`}
                            className="h-7 gap-1 px-2 text-xs"
                          >
                            {isSuspended ? (
                              <RotateCcw className="size-3" />
                            ) : (
                              <Ban className="size-3" />
                            )}
                            <span>
                              {isSuspended
                                ? t("actions.reactivate")
                                : t("actions.suspend")}
                            </span>
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onOpenDiagnostics(customer)}
                            data-testid={`diagnostics-${customer.code}`}
                            className="h-7 gap-1 px-2 text-xs"
                          >
                            <Stethoscope className="size-3" />
                            <span>{t("actions.diagnostics")}</span>
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onRequestDelete(customer)}
                            data-testid={`delete-${customer.code}`}
                            className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-3" />
                            <span>{t("actions.delete")}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
