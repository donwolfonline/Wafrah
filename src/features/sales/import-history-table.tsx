"use client";

import { History } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import type { ImportHistoryEntryDto } from "./schemas";

interface ImportHistoryTableProps {
  history: ImportHistoryEntryDto[];
}

export function ImportHistoryTable({ history }: ImportHistoryTableProps) {
  const t = useTranslations("sales");
  const locale = useLocale() === "en" ? "en" : "ar";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          <span>{t("history.title")}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("history.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="import-history-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("history.fileName")}</TableHead>
                  <TableHead>{t("history.type")}</TableHead>
                  <TableHead>{t("history.imported")}</TableHead>
                  <TableHead>{t("history.rejected")}</TableHead>
                  <TableHead>{t("history.duplicates")}</TableHead>
                  <TableHead>{t("history.who")}</TableHead>
                  <TableHead>{t("history.when")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((entry) => {
                  const formatted = formatDate(entry.createdAt, locale, {
                    dateOptions: {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  });
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium text-sm">
                        {entry.fileName}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            entry.type === "SALES" ? "default" : "secondary"
                          }
                        >
                          {t(`types.${entry.type}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-emerald-700">
                        {formatNumber(entry.rowsImported, locale)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-destructive">
                        {formatNumber(entry.rowsRejected, locale)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-amber-700">
                        {formatNumber(entry.rowsDuplicate, locale)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.uploadedByName ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatted.gregorian}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
