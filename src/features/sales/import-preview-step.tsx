"use client";

import type { ImportType } from "@prisma/client";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileWarning,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { ImportPreviewTables } from "./import-preview-tables";
import type { ImportPreviewResult } from "./schemas";

interface ImportPreviewStepProps {
  type: ImportType;
  fileName: string;
  preview: ImportPreviewResult;
  confirming: boolean;
  onConfirm: () => void;
}

export function ImportPreviewStep({
  type,
  fileName,
  preview,
  confirming,
  onConfirm,
}: ImportPreviewStepProps) {
  const t = useTranslations("sales");
  const locale = useLocale() === "en" ? "en" : "ar";

  const handleDownloadRejected = () => {
    if (!preview.rejectedCsv) return;
    const blob = new Blob([preview.rejectedCsv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const baseName = fileName.replace(/\.[^.]+$/, "");
    link.download = `${baseName}-rejected.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">{t("preview.title")}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="gap-1 bg-emerald-100 text-emerald-900"
              data-testid="preview-valid-badge"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>
                {t("preview.validBadge", {
                  count: formatNumber(preview.validCount, locale),
                })}
              </span>
            </Badge>
            <Badge
              variant={preview.rejectedCount > 0 ? "destructive" : "outline"}
              className="gap-1"
              data-testid="preview-rejected-badge"
            >
              <FileWarning className="h-3.5 w-3.5" />
              <span>
                {t("preview.rejectedBadge", {
                  count: formatNumber(preview.rejectedCount, locale),
                })}
              </span>
            </Badge>
            <Badge
              variant="outline"
              className="gap-1 border-amber-400 text-amber-800"
              data-testid="preview-duplicates-badge"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>
                {t("preview.duplicatesBadge", {
                  count: formatNumber(preview.duplicatesDetected, locale),
                })}
              </span>
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {preview.missingRequiredFields.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("preview.missingColumnsAlert")}</span>
          </div>
        )}

        {preview.overRejectionThreshold && (
          <div
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="over-rejection-alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t("preview.overLimitAlert", {
                rejected: formatNumber(preview.rejectedCount, locale),
                total: formatNumber(preview.totalRows, locale),
              })}
            </span>
          </div>
        )}

        {preview.duplicatesDetected > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950">
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <span>
              {t("preview.duplicateHint", {
                inDb: formatNumber(preview.duplicateInDbCount, locale),
                inFile: formatNumber(preview.duplicateInFileCount, locale),
              })}
            </span>
          </div>
        )}

        <ImportPreviewTables type={type} preview={preview} />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div>
            {preview.rejectedCount > 0 && preview.rejectedCsv && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadRejected}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" />
                <span>{t("preview.downloadRejected")}</span>
              </Button>
            )}
          </div>

          <Button
            type="button"
            onClick={onConfirm}
            disabled={!preview.canConfirm || confirming}
            data-testid="confirm-import-btn"
            className="gap-2"
          >
            {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>
              {confirming
                ? t("preview.confirming")
                : t("preview.confirmButton", {
                    count: formatNumber(preview.validCount, locale),
                  })}
            </span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
