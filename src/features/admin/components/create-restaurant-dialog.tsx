"use client";

import type { SubscriptionPlan } from "@prisma/client";
import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
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
import type { AdminCustomerSummary, CreateRestaurantResult } from "../types";
import { CreatedCredentialsView } from "./created-credentials-view";

interface CreateRestaurantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customer: AdminCustomerSummary) => void;
}

export function CreateRestaurantDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateRestaurantDialogProps) {
  const t = useTranslations("admin");

  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [city, setCity] = useState("Riyadh");
  const [type, setType] = useState("Casual Dining");
  const [plan, setPlan] = useState<SubscriptionPlan>("MEDIUM");
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerLocale, setManagerLocale] = useState<"ar" | "en">("ar");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdResult, setCreatedResult] =
    useState<CreateRestaurantResult | null>(null);

  function resetForm() {
    setName("");
    setNameAr("");
    setCity("Riyadh");
    setType("Casual Dining");
    setPlan("MEDIUM");
    setManagerName("");
    setManagerEmail("");
    setManagerLocale("ar");
    setErrorMessage(null);
    setCreatedResult(null);
  }

  function handleDialogChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nameAr,
          city,
          type,
          plan,
          managerName,
          managerEmail,
          managerLocale,
        }),
      });
      const payload = (await response.json()) as
        | ({ ok: true } & CreateRestaurantResult)
        | { error?: string };

      if (!response.ok || !("customer" in payload)) {
        const message =
          ("error" in payload && payload.error) || t("toasts.actionFailed");
        setErrorMessage(message);
        toast.error(message);
        return;
      }

      setCreatedResult(payload);
      onCreated(payload.customer);
      toast.success(t("toasts.created"));
    } catch {
      const message = t("toasts.actionFailed");
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {createdResult ? (
          <CreatedCredentialsView
            result={createdResult}
            onClose={() => handleDialogChange(false)}
          />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader className="text-start">
              <DialogTitle className="flex items-center gap-2 text-primary">
                <Plus className="size-5 text-accent" />
                <span>{t("createDialog.title")}</span>
              </DialogTitle>
              <DialogDescription>
                {t("createDialog.subtitle")}
              </DialogDescription>
            </DialogHeader>

            {errorMessage ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive text-start"
              >
                {errorMessage}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 text-start">
                <Label htmlFor="admin-create-name-en">
                  {t("createDialog.nameEnLabel")}
                </Label>
                <Input
                  id="admin-create-name-en"
                  dir="ltr"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("createDialog.nameEnPlaceholder")}
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label htmlFor="admin-create-name-ar">
                  {t("createDialog.nameArLabel")}
                </Label>
                <Input
                  id="admin-create-name-ar"
                  dir="rtl"
                  required
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder={t("createDialog.nameArPlaceholder")}
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label htmlFor="admin-create-city">
                  {t("createDialog.cityLabel")}
                </Label>
                <Input
                  id="admin-create-city"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t("createDialog.cityPlaceholder")}
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label htmlFor="admin-create-type">
                  {t("createDialog.typeLabel")}
                </Label>
                <Input
                  id="admin-create-type"
                  required
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder={t("createDialog.typePlaceholder")}
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label>{t("createDialog.planLabel")}</Label>
                <Select
                  value={plan}
                  onValueChange={(v) => setPlan(v as SubscriptionPlan)}
                >
                  <SelectTrigger data-testid="create-plan-select">
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
                <Label>{t("createDialog.managerLocaleLabel")}</Label>
                <Select
                  value={managerLocale}
                  onValueChange={(v) => setManagerLocale(v as "ar" | "en")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">
                      {t("createDialog.localeAr")}
                    </SelectItem>
                    <SelectItem value="en">
                      {t("createDialog.localeEn")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label htmlFor="admin-create-mgr-name">
                  {t("createDialog.managerNameLabel")}
                </Label>
                <Input
                  id="admin-create-mgr-name"
                  required
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder={t("createDialog.managerNamePlaceholder")}
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label htmlFor="admin-create-mgr-email">
                  {t("createDialog.managerEmailLabel")}
                </Label>
                <Input
                  id="admin-create-mgr-email"
                  type="email"
                  dir="ltr"
                  required
                  value={managerEmail}
                  onChange={(e) => setManagerEmail(e.target.value)}
                  placeholder={t("createDialog.managerEmailPlaceholder")}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogChange(false)}
                disabled={submitting}
              >
                {t("actions.close")}
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                data-testid="submit-create-restaurant"
              >
                {submitting
                  ? t("actions.creating")
                  : t("actions.createRestaurant")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
