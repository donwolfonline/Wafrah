"use client";

import { ArrowLeft, ArrowRight, Download, Printer } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { SupportedLocale } from "@/lib/format";

interface ReportActionsBarProps {
  yearMonth: string;
}

export function ReportActionsBar({ yearMonth }: ReportActionsBarProps) {
  const locale = useLocale() as SupportedLocale;
  const t = useTranslations("reports.detail");
  const isRtl = locale === "ar";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Button asChild variant="outline" size="sm" className="gap-2">
        <Link href="/reports">
          {isRtl ? (
            <ArrowRight className="size-4" />
          ) : (
            <ArrowLeft className="size-4" />
          )}
          <span>{t("backToReports")}</span>
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <a
            href={`/api/reports/${yearMonth}/csv?locale=${locale}`}
            download={`wafrah-report-${yearMonth}.csv`}
          >
            <Download className="size-4" />
            <span>{t("downloadCsv")}</span>
          </a>
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-2"
          onClick={() => window.print()}
        >
          <Printer className="size-4" />
          <span>{t("printPdf")}</span>
        </Button>
      </div>
    </div>
  );
}
