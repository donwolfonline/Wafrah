"use client";

import type { Shift, Unit, WasteReason } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SHIFTS, WASTE_REASONS, type WasteLogMenuItemDto } from "./schemas";
import { WasteQuantityPad } from "./waste-quantity-pad";

interface WasteStepComposerProps {
  item: WasteLogMenuItemDto;
  initialShift: Shift;
  maxQuantityByUnit: Record<Unit, number>;
  onBack: () => void;
  onSave: (payload: {
    quantity: string;
    reason: WasteReason;
    shift: Shift;
  }) => void;
}

function addDecimalStrings(current: string, increment: string): string {
  const base = Number.parseFloat(current || "0");
  const inc = Number.parseFloat(increment);
  const safeBase = Number.isFinite(base) ? base : 0;
  const sum = Math.round((safeBase + inc) * 1000) / 1000;
  return String(sum);
}

export function WasteStepComposer({
  item,
  initialShift,
  maxQuantityByUnit,
  onBack,
  onSave,
}: WasteStepComposerProps) {
  const t = useTranslations("waste");
  const locale = useLocale() === "en" ? "en" : "ar";

  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState<WasteReason>("OVER_PREPARATION");
  const [shift, setShift] = useState<Shift>(initialShift);
  const [editingShift, setEditingShift] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const primaryName =
    locale === "ar" ? item.nameAr || item.name : item.name || item.nameAr;
  const unitLabel = t(`units.${item.unit}`);
  const maxForUnit = maxQuantityByUnit[item.unit] ?? 500;

  const numericQty = Number.parseFloat(quantity || "0");
  const unitCostNum = Number.parseFloat(item.unitCost || "0");
  const estimatedSar =
    Number.isFinite(numericQty) && numericQty > 0
      ? (Math.round(numericQty * unitCostNum * 100) / 100).toFixed(2)
      : "0.00";

  const handleDigit = (key: string) => {
    setErrorMsg(null);
    if (key === "BACKSPACE") {
      setQuantity((prev) => prev.slice(0, -1));
      return;
    }
    if (key === ".") {
      setQuantity((prev) => {
        if (prev.includes(".")) return prev;
        return prev.length === 0 ? "0." : `${prev}.`;
      });
      return;
    }
    setQuantity((prev) => {
      if (prev === "0") return key;
      const dotIndex = prev.indexOf(".");
      if (dotIndex !== -1 && prev.length - dotIndex > 3) {
        return prev;
      }
      if (prev.length >= 7) return prev;
      return `${prev}${key}`;
    });
  };

  const handleQuickAdd = (inc: string) => {
    setErrorMsg(null);
    setQuantity((prev) => addDecimalStrings(prev, inc));
  };

  const handleClear = () => {
    setErrorMsg(null);
    setQuantity("");
  };

  const handleSubmit = () => {
    const val = Number.parseFloat(quantity);
    if (!quantity || !Number.isFinite(val) || val <= 0) {
      setErrorMsg(t("errors.quantityRequired"));
      return;
    }
    if (val > maxForUnit) {
      setErrorMsg(
        t("errors.quantityExceedsMax", {
          unit: unitLabel,
          max: String(maxForUnit),
        }),
      );
      return;
    }
    onSave({
      quantity: String(Math.round(val * 1000) / 1000),
      reason,
      shift,
    });
  };

  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col gap-4"
      data-testid="waste-step-composer"
    >
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-lg font-bold text-primary">
            {primaryName}
          </span>
          <span className="text-xs text-muted-foreground">
            {item.category} • {formatCurrency(item.unitCost, locale)} /{" "}
            {unitLabel}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={onBack}
          data-testid="waste-change-item"
          className="shrink-0"
        >
          <ArrowLeft className="size-4 rtl-flip" />
          <span>{t("changeItem")}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WasteQuantityPad
          quantity={quantity}
          unitLabel={unitLabel}
          estimatedSar={estimatedSar}
          onDigit={handleDigit}
          onQuickAdd={handleQuickAdd}
          onClear={handleClear}
        />

        <section
          aria-label={t("step3Title")}
          className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-4 shadow-xs"
          data-testid="waste-step-3"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge
                variant="default"
                className="bg-primary text-primary-foreground"
              >
                {t("step3Badge")}
              </Badge>
              <h2 className="text-base font-bold text-foreground">
                {t("step3Title")}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {WASTE_REASONS.map((r) => {
                const selected = reason === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    data-testid={`reason-chip-${r}`}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-14 items-center justify-center rounded-xl border px-3 py-2.5 text-center text-sm font-bold transition-all active:scale-[0.98]",
                      selected
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-border bg-background text-foreground hover:bg-muted",
                    )}
                  >
                    {t(`reasons.${r}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span>{t("shiftAutoPrefix")}</span>
                <strong
                  className="font-semibold text-foreground"
                  data-testid="waste-active-shift"
                >
                  {t(`shiftsShort.${shift}`)}
                </strong>
              </div>
              {editingShift ? (
                <div className="flex flex-wrap gap-1.5">
                  {SHIFTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setShift(s);
                        setEditingShift(false);
                      }}
                      data-testid={`shift-option-${s}`}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-semibold",
                        shift === s
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-card text-foreground",
                      )}
                    >
                      {t(`shiftsShort.${s}`)}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingShift(true)}
                  data-testid="waste-shift-toggle"
                  className="font-semibold text-primary underline underline-offset-2 hover:text-secondary"
                >
                  {t("editShiftHint")}
                </button>
              )}
            </div>

            {errorMsg ? (
              <p
                role="alert"
                data-testid="waste-validation-error"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
              >
                {errorMsg}
              </p>
            ) : null}

            <Button
              type="button"
              size="touch"
              onClick={handleSubmit}
              data-testid="waste-save-button"
              className="min-h-14 w-full text-base font-bold shadow-sm"
            >
              {t("saveButton")}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
