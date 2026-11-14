import type { AppLocale } from "@/i18n/request";
import { formatCurrency, formatNumber } from "@/lib/format";

interface SignedMetricTextProps {
  value: string | number;
  locale: AppLocale;
  kind?: "currency" | "percent";
  currencyOptions?: Intl.NumberFormatOptions;
}

/**
 * Renders signed SAR or percentage values with isolated LTR numeric sign placement
 * (`<bdi dir="ltr">`) and `whitespace-nowrap` so negative signs never flip after
 * digits in RTL Arabic or wrap onto separate lines on narrow A4 tiles.
 */
export function SignedMetricText({
  value,
  locale,
  kind = "currency",
  currencyOptions,
}: SignedMetricTextProps) {
  const num = Number(value);
  const absNum = Number.isFinite(num) ? Math.abs(num) : 0;
  const isNeg = Number.isFinite(num) && num < 0;

  if (kind === "percent") {
    const numText = formatNumber(absNum, locale, { maximumFractionDigits: 1 });
    return (
      <bdi dir="ltr" className="inline-block whitespace-nowrap tabular-nums">
        {isNeg ? `-${numText}%` : `${numText}%`}
      </bdi>
    );
  }

  if (locale === "ar") {
    const absNumberOnly = formatNumber(absNum, locale, {
      minimumFractionDigits: currencyOptions?.minimumFractionDigits ?? 2,
      maximumFractionDigits: currencyOptions?.maximumFractionDigits ?? 2,
    });
    return (
      <span className="inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums">
        <bdi dir="ltr">{isNeg ? `-${absNumberOnly}` : absNumberOnly}</bdi>
        <span>ر.س</span>
      </span>
    );
  }

  const formattedEn = formatCurrency(num, locale, currencyOptions);
  return (
    <bdi dir="ltr" className="inline-block whitespace-nowrap tabular-nums">
      {formattedEn}
    </bdi>
  );
}
