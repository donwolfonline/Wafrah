"use client";

import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { type FormEvent, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupportedLocale } from "@/lib/format";
import type { AdminCustomerSummary } from "../types";

interface SubscriptionEditDialogProps {
  customer: AdminCustomerSummary | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: (
    restaurantId: string,
    patch: {
      plan: SubscriptionPlan;
      status: SubscriptionStatus;
      renewsAt: string | null;
    },
  ) => void;
}

export function SubscriptionEditDialog({
  customer,
  onOpenChange,
  onUpdated,
}: SubscriptionEditDialogProps) {
  const t = useTranslations("admin");
  const locale = useLocale() as SupportedLocale;

  const [plan, setPlan] = useState<SubscriptionPlan>(
    () => customer?.plan ?? "SMALL",
  );
  const [status, setStatus] = useState<SubscriptionStatus>(
    () => customer?.status ?? "ACTIVE",
  );
  const [renewsAtDate, setRenewsAtDate] = useState(() =>
    customer?.renewsAt ? customer.renewsAt.slice(0, 10) : "",
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) return;

    setSaving(true);
    try {
      const response = await fetch(
        `/api/admin/restaurants/${customer.id}/subscription`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan,
            status,
            renewsAt: renewsAtDate.trim() ? renewsAtDate.trim() : null,
          }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        subscription?: {
          plan: SubscriptionPlan;
          status: SubscriptionStatus;
          renewsAt: string | null;
        };
      };

      if (!response.ok || !payload.subscription) {
        toast.error(payload.error || t("toasts.actionFailed"));
        return;
      }

      onUpdated(customer.id, payload.subscription);
      toast.success(t("toasts.subscriptionUpdated"));
      onOpenChange(false);
    } catch {
      toast.error(t("toasts.actionFailed"));
    } finally {
      setSaving(false);
    }
  }

  const displayName = customer
    ? locale === "ar"
      ? customer.nameAr
      : customer.name
    : "";

  return (
    <Dialog open={Boolean(customer)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader className="text-start">
            <DialogTitle className="text-primary">
              {t("editSubDialog.title")}
            </DialogTitle>
            <DialogDescription>
              {t("editSubDialog.subtitle", { name: displayName })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5 text-start">
              <Label>{t("editSubDialog.planLabel")}</Label>
              <Select
                value={plan}
                onValueChange={(v) => setPlan(v as SubscriptionPlan)}
              >
                <SelectTrigger data-testid="edit-sub-plan-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMALL">{t("plans.SMALL")}</SelectItem>
                  <SelectItem value="MEDIUM">{t("plans.MEDIUM")}</SelectItem>
                  <SelectItem value="CHAIN">{t("plans.CHAIN")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 text-start">
              <Label>{t("editSubDialog.statusLabel")}</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as SubscriptionStatus)}
              >
                <SelectTrigger data-testid="edit-sub-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRIAL">{t("statuses.TRIAL")}</SelectItem>
                  <SelectItem value="ACTIVE">{t("statuses.ACTIVE")}</SelectItem>
                  <SelectItem value="PAST_DUE">
                    {t("statuses.PAST_DUE")}
                  </SelectItem>
                  <SelectItem value="CANCELLED">
                    {t("statuses.CANCELLED")}
                  </SelectItem>
                  <SelectItem value="SUSPENDED">
                    {t("statuses.SUSPENDED")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 text-start">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="admin-sub-renews-at">
                  {t("editSubDialog.renewsAtLabel")}
                </Label>
                {renewsAtDate ? (
                  <button
                    type="button"
                    onClick={() => setRenewsAtDate("")}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    {t("editSubDialog.clearDate")}
                  </button>
                ) : null}
              </div>
              <Input
                id="admin-sub-renews-at"
                type="date"
                dir="ltr"
                value={renewsAtDate}
                onChange={(e) => setRenewsAtDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("actions.close")}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              data-testid="save-subscription-button"
            >
              {saving ? t("actions.saving") : t("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
