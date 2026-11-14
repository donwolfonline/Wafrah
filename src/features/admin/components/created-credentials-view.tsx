"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CreateRestaurantResult } from "../types";

interface CreatedCredentialsViewProps {
  result: CreateRestaurantResult;
  onClose: () => void;
}

export function CreatedCredentialsView({
  result,
  onClose,
}: CreatedCredentialsViewProps) {
  const t = useTranslations("admin");
  const [copied, setCopied] = useState(false);

  async function handleCopyPassword() {
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write unavailable in headless contexts
    }
  }

  return (
    <div data-testid="created-credentials-panel" className="space-y-4">
      <DialogHeader className="pe-8 text-start">
        <DialogTitle className="flex items-center gap-2 text-primary">
          <KeyRound className="size-5 text-accent" />
          <span>{t("createDialog.credentialsTitle")}</span>
        </DialogTitle>
        <DialogDescription>
          {t("createDialog.credentialsWarning")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 rounded-lg border border-accent/40 bg-muted/40 p-4 text-start">
        <div>
          <div className="text-xs text-muted-foreground">
            {t("createDialog.generatedCode")}
          </div>
          <div
            data-testid="created-restaurant-code"
            dir="ltr"
            className="font-mono text-base font-bold text-primary text-start"
          >
            {result.customer.code}
          </div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground">
            {t("createDialog.managerLoginEmail")}
          </div>
          <div
            data-testid="created-manager-email"
            dir="ltr"
            className="font-mono text-sm font-medium text-start"
          >
            {result.manager.email}
          </div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground">
            {t("createDialog.temporaryPassword")}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
            <code
              data-testid="created-temp-password"
              dir="ltr"
              className="font-mono text-sm font-semibold tracking-wide select-all"
            >
              {result.temporaryPassword}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCopyPassword}
              className="gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-primary" />
                  <span>{t("actions.copied")}</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>{t("actions.copyPassword")}</span>
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="pt-1">
          <Badge
            variant={
              result.welcomeEmailStatus === "sent" ? "secondary" : "destructive"
            }
          >
            {result.welcomeEmailStatus === "sent"
              ? t("createDialog.welcomeEmailSent")
              : t("createDialog.welcomeEmailFailed")}
          </Badge>
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          onClick={onClose}
          data-testid="close-created-credentials"
        >
          {t("actions.close")}
        </Button>
      </DialogFooter>
    </div>
  );
}
