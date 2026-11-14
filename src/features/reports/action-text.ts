import { createTranslator } from "next-intl";
import type { AppLocale, AppMessages } from "@/i18n/request";
import { formatNumber } from "@/lib/format";
import type { SuggestedActionItem } from "./types";

const VALID_UNITS = new Set(["KG", "LITER", "PORTION", "PIECE"]);
const VALID_SHIFTS = new Set(["MORNING", "EVENING", "NIGHT"]);

export function formatSuggestedActionText(
  action: SuggestedActionItem,
  locale: AppLocale,
  messages: AppMessages,
): string {
  const tSuggested = createTranslator({
    locale,
    messages,
    namespace: "reports.suggestedActions",
  });
  const tWaste = createTranslator({ locale, messages, namespace: "waste" });
  const tDashboard = createTranslator({
    locale,
    messages,
    namespace: "dashboard",
  });

  const p = action.params;
  const weekdayKey = p.weekday !== undefined ? String(p.weekday) : "0";
  const shiftKey = String(p.shift ?? "MORNING");
  const unitKey = String(p.unit ?? "PORTION");

  return tSuggested(action.ruleKey, {
    item:
      locale === "ar"
        ? String(p.itemNameAr ?? p.itemName ?? "")
        : String(p.itemName ?? p.itemNameAr ?? ""),
    weekday: tDashboard(`weekdays.${weekdayKey}` as "weekdays.0"),
    shift: VALID_SHIFTS.has(shiftKey)
      ? tWaste(`shifts.${shiftKey}` as "shifts.MORNING")
      : shiftKey,
    unit: VALID_UNITS.has(unitKey)
      ? tWaste(`units.${unitKey}` as "units.KG")
      : unitKey,
    suggestedCut: formatNumber(Number(p.suggestedCut ?? 0), locale, {
      maximumFractionDigits: 2,
    }),
    pctChange: formatNumber(Number(p.pctChange ?? 0), locale, {
      maximumFractionDigits: 0,
    }),
    sarCost: formatNumber(Number(p.sarCost ?? 0), locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    sharePct: formatNumber(Number(p.sharePct ?? 0), locale, {
      maximumFractionDigits: 1,
    }),
    entryCount: formatNumber(Number(p.entryCount ?? 0), locale),
    daysCount: formatNumber(Number(p.daysCount ?? 0), locale),
    amountSar: formatNumber(Number(p.amountSar ?? 0), locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  });
}
