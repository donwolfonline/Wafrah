"use client";

import type { Role } from "@prisma/client";
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw, Undo2 } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

export interface ActiveUndoState {
  clientId: string;
  menuItemId: string;
  itemLabel: string;
  quantity: string;
  unitLabel: string;
  expiresAtMs: number;
}

interface WasteHeaderBarProps {
  restaurantDisplayName: string;
  isOffline: boolean;
  syncError: boolean;
  authExpired: boolean;
  pendingCount: number;
  totalTodayWasteSar: string;
  userRole: Role;
  undoState: ActiveUndoState | null;
  undoSecondsLeft: number;
  onUndo: (target: ActiveUndoState) => void;
  onRetrySync: () => void;
}

export function WasteHeaderBar({
  restaurantDisplayName,
  isOffline,
  syncError,
  authExpired,
  pendingCount,
  totalTodayWasteSar,
  userRole,
  undoState,
  undoSecondsLeft,
  onUndo,
  onRetrySync,
}: WasteHeaderBarProps) {
  const t = useTranslations("waste");
  const locale = useLocale() === "en" ? "en" : "ar";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-sm font-bold text-primary">
            {restaurantDisplayName}
          </span>

          {isOffline ? (
            <Badge
              variant="destructive"
              data-testid="waste-offline-badge"
              className="gap-1.5"
            >
              <CloudOff className="size-3.5" />
              <span>{t("offlineBadge")}</span>
            </Badge>
          ) : null}

          {pendingCount > 0 ? (
            <Badge
              variant="secondary"
              data-testid="waste-sync-pending"
              className="gap-1.5"
            >
              <RefreshCw className="size-3 animate-spin" />
              <span>{t("waitingToSync", { count: pendingCount })}</span>
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1.5 rounded-lg border bg-muted/40 px-3 py-1">
            <span className="text-xs text-muted-foreground">
              {t("todayWasteLabel")}:
            </span>
            <strong
              className="text-sm font-extrabold text-primary"
              data-testid="today-waste-sar"
            >
              {formatCurrency(totalTodayWasteSar, locale)}
            </strong>
          </div>

          {userRole === "MANAGER" || userRole === "OWNER" ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">{t("backToDashboard")}</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {undoState ? (
        <div
          role="status"
          data-testid="waste-undo-banner"
          className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary px-4 py-2.5 text-primary-foreground shadow-sm"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 shrink-0 text-accent" />
            <span>
              {t("savedToastTitle", {
                quantity: undoState.quantity,
                unit: undoState.unitLabel,
                item: undoState.itemLabel,
              })}
            </span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onUndo(undoState)}
            data-testid="waste-undo-button"
            className="shrink-0 font-bold"
          >
            <Undo2 className="size-4" />
            <span>{t("undoButton", { seconds: undoSecondsLeft })}</span>
          </Button>
        </div>
      ) : null}

      {authExpired ? (
        <div
          role="alert"
          data-testid="waste-auth-expired"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive text-start"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{t("authExpiredNotice")}</span>
          </div>
          <Button asChild size="sm" variant="destructive" className="shrink-0">
            <Link href="/login?reason=expired">{t("signInAgainButton")}</Link>
          </Button>
        </div>
      ) : syncError && !isOffline ? (
        <div
          role="alert"
          data-testid="waste-sync-error"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive text-start"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{t("syncErrorNotice")}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetrySync}
            data-testid="waste-sync-retry"
            className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <RefreshCw className="size-3.5" />
            <span>{t("syncRetryButton")}</span>
          </Button>
        </div>
      ) : null}
    </>
  );
}
