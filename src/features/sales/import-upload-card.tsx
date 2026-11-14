"use client";

import type { ImportType } from "@prisma/client";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ImportUploadCardProps {
  importType: ImportType;
  fileInputRef: RefObject<HTMLInputElement | null>;
  pasteText: string;
  parsing: boolean;
  confirming: boolean;
  activeDraft: {
    fileName: string;
    format: "csv" | "xlsx";
    rowCount: number;
  } | null;
  onPasteTextChange: (value: string) => void;
  onFileSelected: (file: File) => void;
  onParsePasted: () => void;
  onReset: () => void;
}

export function ImportUploadCard({
  importType,
  fileInputRef,
  pasteText,
  parsing,
  confirming,
  activeDraft,
  onPasteTextChange,
  onFileSelected,
  onParsePasted,
  onReset,
}: ImportUploadCardProps) {
  const t = useTranslations("sales");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span>{t("upload.stepTitle")}</span>
            </CardTitle>
            <CardDescription>{t("upload.stepDescription")}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/api/imports/templates?type=${importType}&locale=ar`}
                download
              >
                <Download className="me-1.5 h-3.5 w-3.5" />
                <span>{t("templates.downloadAr")}</span>
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/api/imports/templates?type=${importType}&locale=en`}
                download
              >
                <Download className="me-1.5 h-3.5 w-3.5" />
                <span>{t("templates.downloadEn")}</span>
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="import-file-input">{t("upload.fileLabel")}</Label>
            <Input
              ref={fileInputRef}
              id="import-file-input"
              type="file"
              accept=".csv,.tsv,.txt,.xlsx"
              disabled={parsing || confirming}
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) onFileSelected(selected);
              }}
            />
          </div>
          {activeDraft && (
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              disabled={parsing || confirming}
              className="gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{t("upload.reset")}</span>
            </Button>
          )}
        </div>

        {!activeDraft && (
          <div className="space-y-2">
            <Label htmlFor="import-paste-input">{t("upload.orPaste")}</Label>
            <textarea
              id="import-paste-input"
              rows={4}
              value={pasteText}
              onChange={(e) => onPasteTextChange(e.target.value)}
              placeholder={t("upload.pastePlaceholder")}
              disabled={parsing}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={onParsePasted}
              disabled={parsing || !pasteText.trim()}
              className="gap-2"
            >
              {parsing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span>
                {parsing ? t("upload.parsing") : t("upload.parseFile")}
              </span>
            </Button>
          </div>
        )}

        {activeDraft && (
          <p className="text-xs text-muted-foreground">
            {t("upload.detectedInfo", {
              format: activeDraft.format.toUpperCase(),
              rows: activeDraft.rowCount,
            })}
            {" · "}
            <span className="font-medium text-foreground">
              {activeDraft.fileName}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
