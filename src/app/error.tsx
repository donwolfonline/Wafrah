"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface GlobalSegmentErrorProps {
  reset: () => void;
}

export default function GlobalSegmentError({ reset }: GlobalSegmentErrorProps) {
  const t = useTranslations("common");

  return (
    <div
      role="alert"
      data-testid="app-error-boundary"
      className="mx-auto flex min-h-[60vh] w-full max-w-lg items-center justify-center p-6"
    >
      <Card className="w-full border-destructive/30">
        <CardHeader className="text-start">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            <CardTitle className="text-lg">{t("errorTitle")}</CardTitle>
          </div>
          <CardDescription>{t("errorDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={reset} className="gap-2">
            <RotateCcw className="size-4" />
            <span>{t("retryButton")}</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
