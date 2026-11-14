"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface PinRevelationState {
  mode: "created" | "reset";
  name: string;
  username: string;
  pin: string;
}

interface PinRevealDialogProps {
  revelation: PinRevelationState | null;
  onClose: () => void;
}

export function PinRevealDialog({ revelation, onClose }: PinRevealDialogProps) {
  const t = useTranslations("staff");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!revelation) {
      return;
    }
    try {
      await navigator.clipboard.writeText(
        `${revelation.username} / PIN: ${revelation.pin}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked on insecure origins
    }
  }

  return (
    <Dialog
      open={Boolean(revelation)}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            <span>
              {revelation?.mode === "created"
                ? t("pinModalCreatedTitle")
                : t("pinModalResetTitle")}
            </span>
          </DialogTitle>
          <DialogDescription>{t("pinModalWarning")}</DialogDescription>
        </DialogHeader>

        {revelation ? (
          <div className="space-y-4 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{t("colName")}</span>
              <span className="font-semibold">{revelation.name}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{t("colUsername")}</span>
              <span dir="ltr" className="font-mono font-semibold">
                {revelation.username}
              </span>
            </div>
            <div className="rounded-md border border-primary/30 bg-card p-3 text-center">
              <p className="text-xs font-medium text-muted-foreground">
                {t("pinLabel")}
              </p>
              <p
                dir="ltr"
                data-testid="revealed-staff-pin"
                className="mt-1 font-mono text-3xl font-bold tracking-[0.35em] text-primary"
              >
                {revelation.pin}
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCopy}
            className="gap-2"
          >
            {copied ? (
              <Check className="size-4 text-primary" />
            ) : (
              <Copy className="size-4" />
            )}
            <span>{copied ? t("copied") : t("copyPin")}</span>
          </Button>
          <Button
            type="button"
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            {t("closePinModal")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
