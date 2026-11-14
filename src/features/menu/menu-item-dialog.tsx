"use client";

import type { Unit } from "@prisma/client";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
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
import { createMenuItemAction, updateMenuItemAction } from "./actions";
import {
  type MenuValidationErrorCode,
  menuItemInputSchema,
  SUPPORTED_UNITS,
} from "./schemas";
import type { SerializedMenuItem } from "./service";

interface MenuItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: SerializedMenuItem | null;
  onSaved: (item: SerializedMenuItem) => void;
}

export function MenuItemDialog({
  open,
  onOpenChange,
  editingItem,
  onSaved,
}: MenuItemDialogProps) {
  const t = useTranslations("menu");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const [nameAr, setNameAr] = useState<string>(editingItem?.nameAr ?? "");
  const [name, setName] = useState<string>(editingItem?.name ?? "");
  const [category, setCategory] = useState<string>(editingItem?.category ?? "");
  const [unit, setUnit] = useState<Unit>(editingItem?.unit ?? "KG");
  const [unitCost, setUnitCost] = useState<string>(editingItem?.unitCost ?? "");
  const [shortageCost, setShortageCost] = useState<string>(
    editingItem?.shortageCost ?? "",
  );
  const [errorKey, setErrorKey] = useState<
    MenuValidationErrorCode | "actionFailed" | null
  >(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);

    const rawPayload = {
      name,
      nameAr,
      category,
      unit,
      unitCost,
      shortageCost: shortageCost.trim() === "" ? null : shortageCost,
    };

    const validation = menuItemInputSchema.safeParse(rawPayload);
    if (!validation.success) {
      const firstIssue = validation.error.issues[0]
        ?.message as MenuValidationErrorCode;
      setErrorKey(firstIssue ?? "actionFailed");
      return;
    }

    startTransition(async () => {
      const result = editingItem
        ? await updateMenuItemAction({
            id: editingItem.id,
            input: rawPayload,
          })
        : await createMenuItemAction(rawPayload);

      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }

      onSaved(result.item);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? t("dialog.editTitle") : t("dialog.addTitle")}
          </DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 text-start">
          {errorKey ? (
            <div
              role="alert"
              data-testid="menu-dialog-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {t(`errors.${errorKey}`)}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="menu-name-ar">{t("dialog.nameArLabel")}</Label>
              <Input
                id="menu-name-ar"
                data-testid="menu-input-name-ar"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder={t("dialog.nameArPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="menu-name-en">{t("dialog.nameEnLabel")}</Label>
              <Input
                id="menu-name-en"
                data-testid="menu-input-name-en"
                dir="ltr"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("dialog.nameEnPlaceholder")}
                className="text-start"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="menu-category">{t("dialog.categoryLabel")}</Label>
              <Input
                id="menu-category"
                data-testid="menu-input-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t("dialog.categoryPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="menu-unit">{t("dialog.unitLabel")}</Label>
              <Select
                value={unit}
                onValueChange={(val) => setUnit(val as Unit)}
              >
                <SelectTrigger
                  id="menu-unit"
                  data-testid="menu-select-unit"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {t(`units.${u}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="menu-unit-cost">
                {t("dialog.unitCostLabel")}
              </Label>
              <Input
                id="menu-unit-cost"
                data-testid="menu-input-unit-cost"
                type="number"
                step="0.01"
                dir="ltr"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder={t("dialog.unitCostPlaceholder")}
                className="text-start"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="menu-shortage-cost">
                {t("dialog.shortageCostLabel")}
              </Label>
              <Input
                id="menu-shortage-cost"
                data-testid="menu-input-shortage-cost"
                type="number"
                step="0.01"
                dir="ltr"
                value={shortageCost}
                onChange={(e) => setShortageCost(e.target.value)}
                placeholder={t("dialog.shortageCostPlaceholder")}
                className="text-start"
              />
            </div>
          </div>

          <p
            data-testid="shortage-cost-helper"
            className="text-xs text-muted-foreground leading-relaxed"
          >
            {t("dialog.shortageCostHelper")}
          </p>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              data-testid="menu-submit-button"
              disabled={isPending}
            >
              {isPending
                ? t("dialog.saving")
                : editingItem
                  ? t("dialog.saveUpdate")
                  : t("dialog.saveCreate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
