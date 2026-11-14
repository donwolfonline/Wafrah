"use client";

import { useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QrCode } from "@/components/ui/qr-code";
import type { StaffRestaurantContext } from "../schemas";

interface QuickStartCardProps {
  restaurant: StaffRestaurantContext;
  loginPath: string;
  origin: string;
}

const MAX_QR_BYTES = 148;

export function QuickStartCard({
  restaurant,
  loginPath,
  origin,
}: QuickStartCardProps) {
  const t = useTranslations("staff");
  const [copiedUrl, setCopiedUrl] = useState(false);

  const fullLoginUrl = origin ? `${origin}${loginPath}` : loginPath;
  const qrPayload =
    new TextEncoder().encode(fullLoginUrl).length <= MAX_QR_BYTES
      ? fullLoginUrl
      : loginPath;

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(fullLoginUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Clipboard may be unavailable on non-HTTPS origins
    }
  }

  return (
    <Card className="print:border-0 print:shadow-none">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <CardTitle>{t("quickStartTitle")}</CardTitle>
          <CardDescription>{t("quickStartSubtitle")}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyUrl}
            className="gap-1.5"
          >
            {copiedUrl ? (
              <Check className="size-4 text-primary" />
            ) : (
              <Copy className="size-4" />
            )}
            <span>{copiedUrl ? t("copied") : t("copyLoginUrlButton")}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => window.print()}
            className="gap-1.5"
          >
            <Printer className="size-4" />
            <span>{t("printCardButton")}</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="print:p-0">
        <div
          data-testid="kitchen-quick-start-card"
          className="rounded-xl border-2 border-primary/30 bg-white p-6 text-slate-900 print:border-slate-800 print:break-inside-avoid"
        >
          <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
            <div className="space-y-1 text-start">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {t("cardHeaderTitle")}
              </p>
              <h2 className="text-xl font-bold text-slate-900">
                {restaurant.nameAr} · {restaurant.name}
              </h2>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-start sm:text-end">
              <p className="text-[11px] font-medium text-emerald-900">
                {t("cardRestaurantCodeLabel")}
              </p>
              <p
                dir="ltr"
                className="font-mono text-2xl font-bold tracking-wider text-emerald-950"
              >
                {restaurant.code}
              </p>
            </div>
          </div>

          <div className="mt-5 grid items-center gap-6 sm:grid-cols-[1fr_auto] print:grid-cols-[1fr_auto]">
            <div className="space-y-4 text-start">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-600">
                  {t("cardLoginUrlLabel")}
                </p>
                <p
                  dir="ltr"
                  className="rounded-md bg-slate-100 px-3 py-2 font-mono text-xs break-all text-slate-900"
                >
                  {fullLoginUrl}
                </p>
              </div>

              <ol className="space-y-2 text-sm leading-relaxed text-slate-800">
                <li>{t("cardStep1")}</li>
                <li>{t("cardStep2")}</li>
                <li>{t("cardStep3")}</li>
              </ol>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-3">
              <QrCode value={qrPayload} label={t("qrAlt")} sizePx={164} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
