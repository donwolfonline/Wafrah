import { formatNumber, type SupportedLocale, toWesternDigits } from "./format";

const KNOWN_ALERT_KEYS = new Set([
  "wasteSpike",
  "wasteSpikeFromZero",
  "dataGap",
  "topWasteItem",
]);
const UNIT_KEYS = new Set(["KG", "LITER", "PORTION", "PIECE"]);

export type KnownAlertBodyKey =
  | "wasteSpike"
  | "wasteSpikeFromZero"
  | "dataGap"
  | "topWasteItem";

export function formatAlertMessageText(params: {
  messageKey: string;
  messageParams: Record<string, unknown>;
  locale: SupportedLocale;
  tAlertBody: (key: KnownAlertBodyKey, values: Record<string, string>) => string;
  tUnits: (unit: "KG" | "LITER" | "PORTION" | "PIECE") => string;
}): string {
  const { messageKey, messageParams: raw, locale, tAlertBody, tUnits } = params;
  const subKey = messageKey.startsWith("insights.alerts.")
    ? messageKey.slice("insights.alerts.".length)
    : messageKey;

  if (!KNOWN_ALERT_KEYS.has(subKey)) {
    return messageKey;
  }

  const rawUnit = typeof raw.unit === "string" ? raw.unit : "";
  const localizedUnit = UNIT_KEYS.has(rawUnit)
    ? tUnits(rawUnit as "KG" | "LITER" | "PORTION" | "PIECE")
    : rawUnit;

  const formatParamNum = (val: unknown, fallback = "0") => {
    if (val === null || val === undefined) return fallback;
    const num = Number(val);
    return Number.isFinite(num)
      ? formatNumber(num, locale, { maximumFractionDigits: 2 })
      : toWesternDigits(String(val));
  };

  return tAlertBody(subKey as KnownAlertBodyKey, {
    itemName: String(raw.itemName ?? raw.itemNameAr ?? ""),
    itemNameAr: String(raw.itemNameAr ?? raw.itemName ?? ""),
    itemCode: String(raw.itemCode ?? ""),
    unit: localizedUnit,
    observed: formatParamNum(raw.observed),
    baseline: formatParamNum(raw.baseline),
    percentageChange: formatParamNum(raw.percentageChange),
    sarImpact: formatParamNum(raw.sarImpact),
    zScore: formatParamNum(raw.zScore),
    date: String(raw.date ?? ""),
    sharePct: formatParamNum(raw.sharePct),
    sarCost: formatParamNum(raw.sarCost),
  });
}
