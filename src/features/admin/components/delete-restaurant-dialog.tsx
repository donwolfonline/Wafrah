"use client";

import { Trash2 } from "lucide-react";
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
import type { SupportedLocale } from "@/lib/format";
import type { AdminCustomerSummary } from "../types";

interface DeleteRestaurantDialogProps {
  customer: AdminCustomerSummary | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (restaurantId: string) => void;
}

export function DeleteRestaurantDialog({
  customer,
  onOpenChange,
  onDeleted,
}: DeleteRestaurantDialogProps) {
  const t = useTranslations("admin");
  const locale = useLocale() as SupportedLocale;
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const expectedPrimary = customer
    ? (locale === "ar" ? customer.nameAr : customer.name)
    : "";
  const matches =
    customer !== null &&
    (confirmName.trim() === customer.name.trim() ||
      confirmName.trim() === customer.nameAr.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || !matches) return;

    setDeleting(true);
    try {
      const response = await fetch(
        `/api/admin/restaurants/${customer.id}/delete`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmName: confirmName.trim() }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        toast.error(payload.error || t("toasts.actionFailed"));
        return;
      }

      onDeleted(customer.id);
      toast.success(t("toasts.deleted"));
      onOpenChange(false);
    } catch {
      toast.error(t("toasts.actionFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={customer !== null}
      onOpenChange={(open) => {
        if (!open) setConfirmName("");
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="size-4" />
            <span>{t("deleteDialog.title")}</span>
          </DialogTitle>
          <DialogDescription>
            {t("deleteDialog.subtitle", { name: expectedPrimary })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive text-start">
            {t("deleteDialog.warning")}
          </div>

          <div className="space-y-2 text-start">
            <Label htmlFor="delete-confirm-name">
              {t("deleteDialog.confirmLabel", { name: expectedPrimary })}
            </Label>
            <Input
              id="delete-confirm-name"
              data-testid="delete-confirm-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={expectedPrimary}
              required
              autoComplete="off"
              className="text-start"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={deleting}
            >
              {t("actions.close")}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              data-testid="confirm-delete-restaurant"
              disabled={!matches || deleting}
            >
              {deleting ? t("actions.deleting") : t("actions.delete")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
