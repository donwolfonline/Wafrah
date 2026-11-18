"use client";

import { CheckCircle2, FileUp, AlertTriangle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ChangeEvent, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { importMenuItemsAction } from "./actions";
import { type MenuCsvParseResult, parseMenuItemsCsv } from "./csv";

interface MenuCsvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function MenuCsvDialog({
  open,
  onOpenChange,
  onImported,
}: MenuCsvDialogProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("menu");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<MenuCsvParseResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      setCsvText(content);
      setPreview(parseMenuItemsCsv(content));
      setSubmitError(null);
    };
    reader.readAsText(file, "utf-8");
  }

  function handleParseText() {
    setPreview(parseMenuItemsCsv(csvText));
    setSubmitError(null);
  }

  function handleConfirmImport() {
    if (!preview || preview.validRows.length === 0) {
      return;
    }
    setSubmitError(null);

    startTransition(async () => {
      const result = await importMenuItemsAction({
        rows: preview.validRows.map((r) => r.data),
      });
      if (!result.ok) {
        setSubmitError(t(`errors.${result.errorKey}`));
        return;
      }
      onImported();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("csv.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("csv.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-start">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="menu-csv-file">{t("csv.fileLabel")}</Label>
              <Input
                id="menu-csv-file"
                data-testid="menu-csv-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="menu-csv-paste">{t("csv.pasteLabel")}</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <textarea
                  id="menu-csv-paste"
                  data-testid="menu-csv-textarea"
                  rows={3}
                  dir="ltr"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={t("csv.pastePlaceholder")}
                  className="flex-1 rounded-md border border-input bg-card px-3 py-2 font-mono text-base text-start focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none md:text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="menu-csv-preview-button"
                  onClick={handleParseText}
                >
                  <FileUp className="size-4" />
                  <span>{t("csv.parseButton")}</span>
                </Button>
              </div>
            </div>
          </div>

          {submitError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </div>
          ) : null}

          {preview?.headerError ? (
            <div
              role="alert"
              data-testid="csv-header-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {t(`errors.${preview.headerError}`)}
            </div>
          ) : null}

          {preview && !preview.headerError ? (
            <div data-testid="csv-preview-section" className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default" data-testid="csv-valid-count">
                  <CheckCircle2 className="me-1 size-3.5" />
                  {t("csv.validCountBadge", {
                    count: preview.validRows.length,
                  })}
                </Badge>
                {preview.invalidRows.length > 0 ? (
                  <Badge variant="destructive" data-testid="csv-invalid-count">
                    <AlertTriangle className="me-1 size-3.5" />
                    {t("csv.invalidCountBadge", {
                      count: preview.invalidRows.length,
                    })}
                  </Badge>
                ) : null}
              </div>

              {preview.validRows.length > 0 ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <h3 className="text-sm font-semibold text-primary">
                    {t("csv.validTableTitle")}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("csv.rowColumn")}</TableHead>
                        <TableHead>{t("columns.name")}</TableHead>
                        <TableHead>{t("columns.category")}</TableHead>
                        <TableHead>{t("columns.unit")}</TableHead>
                        <TableHead className="text-end">
                          {t("columns.unitCost")}
                        </TableHead>
                        <TableHead className="text-end">
                          {t("columns.shortageCost")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.validRows.map((row) => (
                        <TableRow
                          key={row.rowNumber}
                          data-testid={`csv-valid-row-${row.rowNumber}`}
                        >
                          <TableCell className="font-mono text-xs">
                            {row.rowNumber}
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.data.nameAr && row.data.name
                              ? `${row.data.nameAr} / ${row.data.name}`
                              : row.data.nameAr || row.data.name}
                          </TableCell>
                          <TableCell>{row.data.category}</TableCell>
                          <TableCell>{row.data.unit}</TableCell>
                          <TableCell className="text-end">
                            {formatCurrency(row.data.unitCost, locale)}
                          </TableCell>
                          <TableCell className="text-end">
                            {row.data.shortageCost
                              ? formatCurrency(row.data.shortageCost, locale)
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}

              {preview.invalidRows.length > 0 ? (
                <div
                  data-testid="csv-invalid-rows-table"
                  className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                >
                  <h3 className="text-sm font-semibold text-destructive">
                    {t("csv.invalidTableTitle")}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("csv.rowColumn")}</TableHead>
                        <TableHead>{t("columns.name")}</TableHead>
                        <TableHead>{t("csv.reasonColumn")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.invalidRows.map((row) => (
                        <TableRow
                          key={row.rowNumber}
                          data-testid={`csv-invalid-row-${row.rowNumber}`}
                        >
                          <TableCell className="font-mono text-xs">
                            {row.rowNumber}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.raw.nameAr || row.raw.name || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-destructive font-medium">
                            {row.reasons
                              .map((reason) => t(`errors.${reason}`))
                              .join(" • ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            data-testid="confirm-csv-import"
            disabled={isPending || !preview || preview.validRows.length === 0}
            onClick={handleConfirmImport}
          >
            {isPending
              ? t("csv.importing")
              : t("csv.confirmImport", {
                  count: preview?.validRows.length ?? 0,
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
