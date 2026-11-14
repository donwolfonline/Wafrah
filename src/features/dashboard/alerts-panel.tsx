"use client";

import { AlertCircle, Bell, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
import { formatAlertMessageText } from "@/lib/alert-format";
import {
  formatGregorianDate,
  type SupportedLocale,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardAlertRow } from "./types";

const SEVERITY_BADGE_CLASS: Record<DashboardAlertRow["severity"], string> = {
  CRITICAL: "border-destructive bg-destructive text-white",
  WARNING: "border-accent bg-accent text-accent-foreground",
  INFO: "border-border bg-muted text-muted-foreground",
};

interface AlertsPanelProps {
  initialAlerts: DashboardAlertRow[];
}

export function AlertsPanel({ initialAlerts }: AlertsPanelProps) {
  const locale = useLocale() as SupportedLocale;
  const router = useRouter();
  const t = useTranslations("dashboard");
  const tAlertBody = useTranslations("insights.alerts");
  const tUnits = useTranslations("waste.units");

  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, "READ" | "DISMISSED">
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const alerts = initialAlerts
    .map((item) => {
      const override = statusOverrides[item.id];
      return override ? { ...item, status: override } : item;
    })
    .filter((item) => item.status !== "DISMISSED");

  const unreadCount = alerts.filter((a) => a.status === "UNREAD").length;

  function renderLocalizedMessage(alert: DashboardAlertRow): string {
    return formatAlertMessageText({
      messageKey: alert.messageKey,
      messageParams: alert.messageParams,
      locale,
      tAlertBody: (key, values) => tAlertBody(key, values),
      tUnits: (unit) => tUnits(unit),
    });
  }

  async function handleStatusUpdate(
    alertId: string,
    nextStatus: "READ" | "DISMISSED",
  ) {
    setBusyId(alertId);
    try {
      const res = await fetch(`/api/dashboard/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        toast.error(t("alerts.updateError"));
        return;
      }

      setStatusOverrides((prev) => ({
        ...prev,
        [alertId]: nextStatus,
      }));
      toast.success(
        nextStatus === "DISMISSED"
          ? t("alerts.updatedDismissed")
          : t("alerts.updatedRead"),
      );
      router.refresh();
    } catch {
      toast.error(t("alerts.updateError"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card data-testid="dashboard-alerts-panel" className="text-start">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-primary" />
            <CardTitle className="text-lg text-primary">
              {t("alerts.title")}
            </CardTitle>
            {unreadCount > 0 ? (
              <Badge variant="secondary" className="tabular-nums">
                {t("alerts.unreadCount", { count: unreadCount })}
              </Badge>
            ) : null}
          </div>
          <CardDescription>{t("alerts.description")}</CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {alerts.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed py-8 text-sm text-muted-foreground">
            {t("alerts.empty")}
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const isUnread = alert.status === "UNREAD";
              const isBusy = busyId === alert.id;
              return (
                <div
                  key={alert.id}
                  data-testid={`alert-item-${alert.id}`}
                  data-severity={alert.severity}
                  data-status={alert.status}
                  className={cn(
                    "flex flex-col justify-between gap-3 rounded-lg border p-3.5 sm:flex-row sm:items-center",
                    isUnread
                      ? "border-s-4 border-s-primary bg-background"
                      : "bg-muted/25 opacity-85",
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={SEVERITY_BADGE_CLASS[alert.severity]}
                      >
                        <AlertCircle className="me-1 size-3" />
                        {t(`alerts.severity.${alert.severity}`)}
                      </Badge>
                      <Badge variant={isUnread ? "default" : "outline"}>
                        {isUnread
                          ? t("alerts.unreadBadge")
                          : t("alerts.readBadge")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatGregorianDate(alert.createdAtIso, locale)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">
                      {renderLocalizedMessage(alert)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {isUnread ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        data-testid={`alert-read-btn-${alert.id}`}
                        onClick={() => handleStatusUpdate(alert.id, "READ")}
                      >
                        <Check className="me-1 size-3.5" />
                        <span>{t("alerts.markRead")}</span>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      data-testid={`alert-dismiss-btn-${alert.id}`}
                      onClick={() => handleStatusUpdate(alert.id, "DISMISSED")}
                    >
                      <X className="me-1 size-3.5" />
                      <span>{t("alerts.dismiss")}</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
