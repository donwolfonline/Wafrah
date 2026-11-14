export type SupportedLocale = "ar" | "en";

export type DecimalLike =
  number | string | { toString(): string; toNumber?: () => number };

export const RIYADH_TIME_ZONE = "Asia/Riyadh";

const EASTERN_ARABIC_DIGITS = /[٠-٩]/g;
const EXTENDED_ARABIC_DIGITS = /[۰-۹]/g;

export function toWesternDigits(text: string): string {
  return text
    .replace(EASTERN_ARABIC_DIGITS, (char) =>
      String(char.charCodeAt(0) - 0x0660),
    )
    .replace(EXTENDED_ARABIC_DIGITS, (char) =>
      String(char.charCodeAt(0) - 0x06f0),
    );
}

export function getIntlLocaleTag(locale: SupportedLocale): string {
  return locale === "ar" ? "ar-SA-u-nu-latn" : "en-US-u-nu-latn";
}

export function toNumericValue(value: DecimalLike): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value.toNumber === "function") {
    return value.toNumber();
  }
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatNumber(
  value: DecimalLike,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
): string {
  const numeric = toNumericValue(value);
  const formatter = new Intl.NumberFormat(getIntlLocaleTag(locale), {
    numberingSystem: "latn",
    ...options,
  });
  return toWesternDigits(formatter.format(numeric));
}

const SAR_DISPLAY_SYMBOL: Record<SupportedLocale, string> = {
  ar: "ر.س",
  en: "SAR",
};

/**
 * Formats SAR amounts deterministically across SSR (Node ICU) and browsers
 * so CLDR currency symbol updates (e.g. U+20C1 vs "ر.س.") never cause
 * React hydration mismatches.
 */
export function formatCurrency(
  value: DecimalLike,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
): string {
  const numeric = toNumericValue(value);
  const normalized = Object.is(numeric, -0) || numeric === 0 ? 0 : numeric;
  const isNegative = normalized < 0;
  const absNumeric = Math.abs(normalized);

  const numberOptions: Intl.NumberFormatOptions = { ...options };
  const currencyDisplay = numberOptions.currencyDisplay;
  delete numberOptions.style;
  delete numberOptions.currency;
  delete numberOptions.currencyDisplay;
  delete numberOptions.currencySign;

  const formattedAbs = formatNumber(absNumeric, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...numberOptions,
  });
  const sign = isNegative ? "-" : "";

  if (locale === "ar") {
    const unit = currencyDisplay === "code" ? "SAR" : SAR_DISPLAY_SYMBOL.ar;
    return `${sign}${formattedAbs}\u00A0${unit}`;
  }

  return `${sign}${SAR_DISPLAY_SYMBOL.en}\u00A0${formattedAbs}`;
}

function toDateInstance(dateInput: Date | string | number): Date {
  return dateInput instanceof Date ? dateInput : new Date(dateInput);
}

function extractDatePartMap(
  formatter: Intl.DateTimeFormat,
  date: Date,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal" && !(part.type in map)) {
      map[part.type] = toWesternDigits(part.value).trim();
    }
  }
  return map;
}

/**
 * Formats Intl date parts deterministically across SSR (Node ICU) and browsers
 * so CLDR punctuation differences (e.g. Arabic comma U+060C in "13 نوفمبر، 2026"
 * vs "13 نوفمبر 2026") never cause React hydration mismatches.
 */
function formatDeterministicDateParts(
  date: Date,
  locale: SupportedLocale,
  resolvedOptions: Intl.DateTimeFormatOptions,
): string {
  const formatter = new Intl.DateTimeFormat(
    getIntlLocaleTag(locale),
    resolvedOptions,
  );
  const parts = extractDatePartMap(formatter, date);

  let datePart = "";
  if (locale === "ar") {
    datePart = [parts.day, parts.month, parts.year, parts.era]
      .filter(Boolean)
      .join(" ");
    if (parts.weekday) {
      datePart = datePart ? `${parts.weekday} ${datePart}` : parts.weekday;
    }
  } else {
    const base =
      parts.month && parts.day
        ? [
            `${parts.month} ${parts.day}${parts.year ? "," : ""}`,
            parts.year,
            parts.era,
          ]
            .filter(Boolean)
            .join(" ")
        : [parts.month, parts.day, parts.year, parts.era]
            .filter(Boolean)
            .join(" ");
    datePart = parts.weekday
      ? base
        ? `${parts.weekday}, ${base}`
        : parts.weekday
      : base;
  }

  if (parts.hour !== undefined && parts.minute !== undefined) {
    const hour =
      resolvedOptions.hour === "2-digit"
        ? parts.hour.padStart(2, "0")
        : parts.hour;
    const minute = parts.minute.padStart(2, "0");
    const period = parts.dayPeriod
      ? locale === "ar" && (parts.dayPeriod === "AM" || parts.dayPeriod === "PM")
        ? parts.dayPeriod === "AM"
          ? "ص"
          : "م"
        : parts.dayPeriod
      : "";
    const timePart = `${hour}:${minute}${period ? ` ${period}` : ""}`;
    return datePart ? `${datePart} · ${timePart}` : timePart;
  }

  return datePart || toWesternDigits(formatter.format(date));
}

export function formatGregorianDate(
  dateInput: Date | string | number,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = toDateInstance(dateInput);
  return formatDeterministicDateParts(date, locale, {
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  });
}

export function formatHijriDate(
  dateInput: Date | string | number,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = toDateInstance(dateInput);
  return formatDeterministicDateParts(date, locale, {
    calendar: "islamic-umalqura",
    numberingSystem: "latn",
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    ...options,
  });
}

export interface FormattedDateParts {
  gregorian: string;
  hijri: string | null;
  combined: string;
}

export function formatDate(
  dateInput: Date | string | number,
  locale: SupportedLocale,
  options?: {
    includeHijri?: boolean;
    dateOptions?: Intl.DateTimeFormatOptions;
  },
): FormattedDateParts {
  const gregorian = formatGregorianDate(
    dateInput,
    locale,
    options?.dateOptions,
  );
  const includeHijri = options?.includeHijri ?? false;
  if (!includeHijri) {
    return {
      gregorian,
      hijri: null,
      combined: gregorian,
    };
  }
  const hijri = formatHijriDate(dateInput, locale);
  return {
    gregorian,
    hijri,
    combined: `${gregorian} (${hijri})`,
  };
}
