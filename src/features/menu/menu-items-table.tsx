"use client";

import { Pencil, Power } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppLocale } from "@/i18n/request";
import { formatCurrency } from "@/lib/format";
import type { SerializedMenuItem } from "./service";

interface MenuItemsTableProps {
  items: SerializedMenuItem[];
  isPending: boolean;
  onEdit: (item: SerializedMenuItem) => void;
  onToggleActive: (item: SerializedMenuItem) => void;
}

export function MenuItemsTable({
  items,
  isPending,
  onEdit,
  onToggleActive,
}: MenuItemsTableProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("menu");

  return (
    <Table className="block md:table">
      <TableHeader className="hidden md:table-header-group">
        <TableRow>
          <TableHead>{t("columns.name")}</TableHead>
          <TableHead>{t("columns.category")}</TableHead>
          <TableHead>{t("columns.unit")}</TableHead>
          <TableHead className="text-end">{t("columns.unitCost")}</TableHead>
          <TableHead className="text-end">
            {t("columns.shortageCost")}
          </TableHead>
          <TableHead>{t("columns.status")}</TableHead>
          <TableHead className="text-end">{t("columns.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="block space-y-3 md:table-row-group md:space-y-0">
        {items.length === 0 ? (
          <TableRow className="block md:table-row">
            <TableCell
              colSpan={7}
              className="block py-8 text-center text-muted-foreground md:table-cell"
            >
              {t("emptyState")}
            </TableCell>
          </TableRow>
        ) : (
          items.map((item) => (
            <TableRow
              key={item.id}
              data-testid={`menu-row-${item.id}`}
              className={`block rounded-xl border bg-card p-3.5 shadow-2xs md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:p-0 md:shadow-none ${!item.active ? "opacity-60" : ""}`}
            >
              <TableCell className="block border-b border-border/60 px-0 pt-0 pb-2.5 md:table-cell md:border-b-0 md:px-2 md:py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-foreground">
                    {item.nameAr || item.name}
                  </span>
                  {item.nameAr && item.name ? (
                    <span className="text-xs text-muted-foreground">
                      {item.name}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 md:table-cell md:px-2 md:py-2">
                <span className="text-xs font-medium text-muted-foreground md:hidden">
                  {t("columns.category")}
                </span>
                <Badge variant="outline">{item.category}</Badge>
              </TableCell>
              <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 md:table-cell md:px-2 md:py-2">
                <span className="text-xs font-medium text-muted-foreground md:hidden">
                  {t("columns.unit")}
                </span>
                <Badge variant="secondary">{item.unit}</Badge>
              </TableCell>
              <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 font-semibold text-primary md:table-cell md:px-2 md:py-2 md:text-end">
                <span className="text-xs font-medium text-muted-foreground md:hidden">
                  {t("columns.unitCost")}
                </span>
                <span>{formatCurrency(item.unitCost, locale)}</span>
              </TableCell>
              <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 md:table-cell md:px-2 md:py-2 md:text-end">
                <span className="text-xs font-medium text-muted-foreground md:hidden">
                  {t("columns.shortageCost")}
                </span>
                <div className="inline-flex flex-col items-end gap-0.5">
                  <span className="font-medium">
                    {formatCurrency(item.effectiveShortageCost, locale)}
                  </span>
                  {item.shortageCost === null ? (
                    <span className="text-[11px] text-muted-foreground">
                      ({t("defaultShortageTag")})
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="flex items-center justify-between gap-2 px-0 py-1.5 md:table-cell md:px-2 md:py-2">
                <span className="text-xs font-medium text-muted-foreground md:hidden">
                  {t("columns.status")}
                </span>
                <Badge
                  variant={item.active ? "default" : "outline"}
                  data-testid={`status-badge-${item.id}`}
                >
                  {item.active ? t("status.active") : t("status.inactive")}
                </Badge>
              </TableCell>
              <TableCell className="block border-t border-border/60 px-0 pt-2.5 pb-0 text-end md:table-cell md:border-t-0 md:px-2 md:py-2">
                <div className="grid grid-cols-2 gap-2 md:inline-flex md:items-center md:justify-end md:gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    data-testid={`edit-item-${item.id}`}
                    onClick={() => onEdit(item)}
                    className="h-8 md:h-6"
                  >
                    <Pencil className="size-3" />
                    <span>{t("editButton")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant={item.active ? "ghost" : "secondary"}
                    size="xs"
                    disabled={isPending}
                    data-testid={`toggle-active-${item.id}`}
                    onClick={() => onToggleActive(item)}
                    className="h-8 md:h-6"
                  >
                    <Power className="size-3" />
                    <span>
                      {item.active
                        ? t("status.deactivate")
                        : t("status.activate")}
                    </span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
