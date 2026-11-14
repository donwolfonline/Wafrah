"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { SupportedLocale } from "@/lib/format";
import type { AdminCustomerSummary, TenantDiagnosticsDto } from "../types";
import { DiagnosticsDetails } from "./diagnostics-details";

interface DiagnosticsLoaderProps {
  customerId: string;
}

function DiagnosticsLoader({ customerId }: DiagnosticsLoaderProps) {
  const t = useTranslations("admin");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<TenantDiagnosticsDto | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const loadErrorFallback = t("diagnostics.loadError");

    fetch(`/api/admin/restaurants/${customerId}/diagnostics`)
      .then(async (res) => {
        const payload = (await res.json()) as {
          ok?: boolean;
          error?: string;
          diagnostics?: TenantDiagnosticsDto;
        };
        if (!res.ok || !payload.diagnostics) {
          throw new Error(payload.error || loadErrorFallback);
        }
        if (!cancelled) {
          setDiagnostics(payload.diagnostics);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : loadErrorFallback,
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, t]);

  if (loading) {
    return (
      <div className="space-y-3" aria-label={t("diagnostics.loading")}>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive text-start"
      >
        {error}
      </div>
    );
  }

  return diagnostics ? <DiagnosticsDetails diagnostics={diagnostics} /> : null;
}

interface DiagnosticsDialogProps {
  customer: AdminCustomerSummary | null;
  onOpenChange: (open: boolean) => void;
}

export function DiagnosticsDialog({
  customer,
  onOpenChange,
}: DiagnosticsDialogProps) {
  const t = useTranslations("admin");
  const locale = useLocale() as SupportedLocale;

  const tenantTitle = customer
    ? `${locale === "ar" ? customer.nameAr : customer.name} (${customer.code})`
    : "";

  return (
    <Dialog open={Boolean(customer)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ShieldCheck className="size-5 text-secondary" />
            <span>{t("diagnostics.title")}</span>
          </DialogTitle>
          <DialogDescription>{tenantTitle}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-secondary/30 bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground text-start">
          {t("diagnostics.privacyBanner")}
        </div>

        {customer ? (
          <DiagnosticsLoader key={customer.id} customerId={customer.id} />
        ) : null}

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("actions.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
