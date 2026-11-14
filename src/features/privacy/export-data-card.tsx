"use client";

import { Download, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ExportDataCard() {
  const t = useTranslations("dataPrivacy.exportCard");
  const [downloading, setDownloading] = useState(false);

  async function handleExportDownload() {
    setDownloading(true);
    try {
      const response = await fetch("/api/export", { method: "GET" });
      if (!response.ok) {
        toast.error(t("downloadError"));
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      const fileName = filenameMatch?.[1] ?? "wafrah-export.zip";

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(t("downloadSuccess"));
    } catch {
      toast.error(t("downloadError"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-start">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-start">
        <p className="text-xs text-muted-foreground">{t("contentsNote")}</p>
        <Button
          type="button"
          variant="outline"
          data-testid="export-tenant-zip-btn"
          disabled={downloading}
          onClick={handleExportDownload}
          className="gap-2"
        >
          <Download className="size-4" />
          <span>{downloading ? t("downloading") : t("downloadButton")}</span>
        </Button>
      </CardContent>
    </Card>
  );
}
