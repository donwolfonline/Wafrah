"use client";

import { CalendarClock, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import type { BaselineWindow } from "./types";

interface BaselineSettingsCardProps {
  baselineWindow: BaselineWindow;
}

export function BaselineSettingsCard({
  baselineWindow,
}: BaselineSettingsCardProps) {
  const router = useRouter();
  const t = useTranslations("reports.baseline");

  const [startDate, setStartDate] = useState(baselineWindow.startDate);
  const [endDate, setEndDate] = useState(baselineWindow.endDate);
  const [saving, setSaving] = useState(false);

  async function submitUpdate(
    payload: { baselineStart: string | null; baselineEnd: string | null },
    successMessage: string,
  ) {
    setSaving(true);
    try {
      const res = await fetch("/api/reports/baseline", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(t("errorToast"));
        return;
      }
      toast.success(successMessage);
      router.refresh();
    } catch {
      toast.error(t("errorToast"));
    } finally {
      setSaving(false);
    }
  }

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!startDate || !endDate || startDate > endDate) {
      toast.error(t("invalidRangeError"));
      return;
    }
    const startMs = Date.parse(`${startDate}T00:00:00Z`);
    const endMs = Date.parse(`${endDate}T00:00:00Z`);
    if (Math.round((endMs - startMs) / 86_400_000) > 365) {
      toast.error(t("invalidRangeError"));
      return;
    }
    void submitUpdate(
      { baselineStart: startDate, baselineEnd: endDate },
      t("savedToast"),
    );
  }

  function handleReset() {
    void submitUpdate(
      { baselineStart: null, baselineEnd: null },
      t("resetToast"),
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" />
            <CardTitle>{t("title")}</CardTitle>
          </div>
          <Badge variant={baselineWindow.isCustom ? "default" : "secondary"}>
            {baselineWindow.isCustom
              ? t("customWindowNote", {
                  start: baselineWindow.startDate,
                  end: baselineWindow.endDate,
                })
              : t("autoWindowNote", {
                  start: baselineWindow.startDate,
                  end: baselineWindow.endDate,
                })}
          </Badge>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {baselineWindow.isCalibrating && (
          <p className="mb-4 rounded-md border border-accent bg-accent/20 px-3 py-2 text-sm text-foreground">
            {t("calibratingNote", {
              days: baselineWindow.calibratingDaysLeft,
            })}
          </p>
        )}
        <form
          onSubmit={handleSave}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        >
          <div className="space-y-1.5">
            <Label htmlFor="baseline-start">{t("startLabel")}</Label>
            <Input
              id="baseline-start"
              type="date"
              dir="ltr"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="baseline-end">{t("endLabel")}</Label>
            <Input
              id="baseline-end"
              type="date"
              dir="ltr"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <Button type="submit" disabled={saving} className="min-h-10 gap-2">
            <Save className="size-4" />
            <span>{saving ? t("savingButton") : t("saveButton")}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving || !baselineWindow.isCustom}
            onClick={handleReset}
            className="min-h-10 gap-2"
          >
            <RotateCcw className="size-4" />
            <span>{t("resetButton")}</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
