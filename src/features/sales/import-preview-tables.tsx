"use client";

import type { ImportType } from "@prisma/client";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatCurrency,
  formatGregorianDate,
  formatNumber,
} from "@/lib/format";
import type { ImportPreviewResult } from "./schemas";

interface ImportPreviewTablesProps {
  type: ImportType;
  preview: ImportPreviewResult;
}

export function ImportPreviewTables({
  type,
  preview,
}: ImportPreviewTablesProps) {
  const t = useTranslations("sales");
  const locale = useLocale() === "en" ? "en" : "ar";

  return (
    <Tabs
      defaultValue={preview.validCount > 0 ? "valid" : "rejected"}
      className="space-y-3"
    >
      <TabsList>
        <TabsTrigger value="valid">
          {t("preview.validTab", {
            count: formatNumber(preview.validCount, locale),
          })}
        </TabsTrigger>
        <TabsTrigger value="rejected">
          {t("preview.rejectedTab", {
            count: formatNumber(preview.rejectedCount, locale),
          })}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="valid">
        <div className="max-h-80 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("preview.columns.row")}</TableHead>
                <TableHead>{t("preview.columns.date")}</TableHead>
                <TableHead>{t("preview.columns.item")}</TableHead>
                <TableHead>{t("preview.columns.quantity")}</TableHead>
                <TableHead>
                  {type === "SALES"
                    ? t("preview.columns.channel")
                    : t("preview.columns.cost")}
                </TableHead>
                <TableHead>{t("preview.columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.validRows.slice(0, 200).map((row) => (
                <TableRow
                  key={`${row.rowNumber}-${row.menuItemId}-${row.dateKey}`}
                >
                  <TableCell className="font-mono text-xs">
                    {formatNumber(row.rowNumber, locale)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatGregorianDate(`${row.dateKey}T12:00:00Z`, locale)}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {locale === "ar" ? row.itemNameAr : row.itemName}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatNumber(row.quantity, locale)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {type === "SALES"
                      ? t(`channels.${row.channel ?? "UNSPECIFIED"}`)
                      : row.cost !== null
                        ? formatCurrency(row.cost, locale)
                        : "—"}
                  </TableCell>
                  <TableCell>
                    {row.isDuplicateInFile ? (
                      <Badge
                        variant="outline"
                        className="border-amber-400 text-amber-800"
                      >
                        {t("preview.fileDuplicateBadge")}
                      </Badge>
                    ) : row.isExistingInDb ? (
                      <Badge variant="secondary">
                        {t("preview.existingUpdateBadge")}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-emerald-400 text-emerald-800"
                      >
                        {t("preview.readyBadge")}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="rejected">
        <div className="max-h-80 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("preview.columns.row")}</TableHead>
                <TableHead>{t("preview.columns.date")}</TableHead>
                <TableHead>{t("preview.columns.item")}</TableHead>
                <TableHead>{t("preview.columns.quantity")}</TableHead>
                <TableHead>{t("preview.columns.reasons")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rejectedRows.slice(0, 200).map((row) => (
                <TableRow key={row.rowNumber}>
                  <TableCell className="font-mono text-xs">
                    {formatNumber(row.rowNumber, locale)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.rawDate || "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.rawItem || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.rawQuantity || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.reasons.map((reason) => (
                        <Badge
                          key={reason}
                          variant="destructive"
                          className="text-[11px]"
                        >
                          {t(`reasons.${reason}`)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>
    </Tabs>
  );
}
