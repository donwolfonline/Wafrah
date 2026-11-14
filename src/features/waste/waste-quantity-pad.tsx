"use client";

import { Delete, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";

const KEYPAD_ROWS = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
  [".", "0", "BACKSPACE"],
] as const;

const QUICK_ADD_VALUES = ["0.5", "1", "5"] as const;

interface WasteQuantityPadProps {
  quantity: string;
  unitLabel: string;
  estimatedSar: string;
  onDigit: (key: string) => void;
  onQuickAdd: (increment: string) => void;
  onClear: () => void;
}

export function WasteQuantityPad({
  quantity,
  unitLabel,
  estimatedSar,
  onDigit,
  onQuickAdd,
  onClear,
}: WasteQuantityPadProps) {
  const t = useTranslations("waste");
  const locale = useLocale() === "en" ? "en" : "ar";

  return (
    <section
      aria-label={t("step2Title")}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs"
      data-testid="waste-step-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant="default"
            className="bg-primary text-primary-foreground"
          >
            {t("step2Badge")}
          </Badge>
          <h2 className="text-base font-bold text-foreground">
            {t("step2Title")}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClear}
          data-testid="keypad-clear"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          <span>{t("clearKey")}</span>
        </button>
      </div>

      <div
        className="flex items-baseline justify-between rounded-xl border-2 border-primary/30 bg-muted/40 px-4 py-3"
        data-testid="waste-quantity-display"
      >
        <div className="flex items-baseline gap-2">
          <span
            className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
            data-testid="waste-quantity-value"
          >
            {quantity || "0"}
          </span>
          <span className="text-base font-semibold text-primary">
            {unitLabel}
          </span>
        </div>
        <div className="text-end">
          <span className="block text-[11px] text-muted-foreground">
            {t("estimatedCostLabel")}
          </span>
          <span className="text-sm font-bold text-secondary">
            {formatCurrency(estimatedSar, locale)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {QUICK_ADD_VALUES.map((inc) => (
          <button
            key={inc}
            type="button"
            onClick={() => onQuickAdd(inc)}
            data-testid={`quick-add-${inc}`}
            className="flex min-h-12 items-center justify-center rounded-xl border border-secondary/40 bg-secondary/10 px-3 py-2 text-base font-bold text-primary transition-colors hover:bg-secondary/20 active:scale-[0.98]"
          >
            +{inc} {unitLabel}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYPAD_ROWS.flat().map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onDigit(key)}
            data-testid={
              key === "."
                ? "keypad-decimal"
                : key === "BACKSPACE"
                  ? "keypad-backspace"
                  : `keypad-digit-${key}`
            }
            aria-label={key === "BACKSPACE" ? t("backspaceKey") : key}
            className="flex min-h-14 items-center justify-center rounded-xl border bg-background text-xl font-bold text-foreground shadow-2xs transition-colors hover:bg-muted active:scale-[0.98]"
          >
            {key === "BACKSPACE" ? <Delete className="size-5" /> : key}
          </button>
        ))}
      </div>
    </section>
  );
}
