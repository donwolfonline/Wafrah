import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/request";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PLAN_MONTHLY_PRICES,
  type CalculatorResult,
  type PlanTierId,
} from "./calculator-math";
import { DirectionalArrowIcon } from "./landing-icons";
import { PilotCtaLink } from "./pilot-cta-link";

export interface SavingsCalculatorCopy {
  heading: string;
  subheading: string;
  estimateBadge: string;
  purchasesLabel: string;
  purchasesHint: string;
  purchasesRangeLabel: string;
  wastePctLabel: string;
  wastePctHint: string;
  reductionPctLabel: string;
  reductionPctHint: string;
  reductionMinLabel: string;
  reductionMaxLabel: string;
  clampedNotice: string;
  resultsRegionLabel: string;
  monthlyWasteResultLabel: string;
  monthlySavingsResultLabel: string;
  annualSavingsResultLabel: string;
  planComparisonTitle: string;
  recommendedPlanLabel: string;
  planFeeLabel: string;
  netAfterPlanLabel: string;
  belowPlanFeeNote: string;
  tierNames: Record<PlanTierId, string>;
  tierThresholds: Record<PlanTierId, string>;
  sarAmountTemplate: string;
  sarPerMonthTemplate: string;
  sarPerYearTemplate: string;
  sarUnit: string;
  disclaimer: string;
  cta: string;
}

export function interpolateTemplate(
  template: string,
  replacements: Record<string, string>,
): string {
  let output = template;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{${token}}`, value);
  }
  return output;
}

interface SavingsCalculatorResultsProps {
  locale: AppLocale;
  copy: SavingsCalculatorCopy;
  result: CalculatorResult;
}

export function SavingsCalculatorResults({
  locale,
  copy,
  result,
}: SavingsCalculatorResultsProps) {
  const formatInt = (value: number) =>
    formatNumber(value, locale, { maximumFractionDigits: 0 });

  const formatSarMonth = (value: number) =>
    interpolateTemplate(copy.sarPerMonthTemplate, {
      amount: formatInt(value),
    });

  const formatSarYear = (value: number) =>
    interpolateTemplate(copy.sarPerYearTemplate, {
      amount: formatInt(value),
    });

  const recommendedPlanName = copy.tierNames[result.recommendedPlanId];
  const recommendedPlanThreshold = copy.tierThresholds[result.recommendedPlanId];
  const belowPlanNote = interpolateTemplate(copy.belowPlanFeeNote, {
    price: formatInt(result.recommendedPlanPrice),
  });

  const planPills: ReadonlyArray<{ id: PlanTierId; price: number }> = [
    { id: "small", price: PLAN_MONTHLY_PRICES.small },
    { id: "medium", price: PLAN_MONTHLY_PRICES.medium },
    { id: "enterprise", price: PLAN_MONTHLY_PRICES.enterprise },
  ];

  return (
    <Card
      aria-live="polite"
      aria-label={copy.resultsRegionLabel}
      className="min-w-0 border-brand-dark-teal/20 bg-brand-dark-teal py-6 text-white shadow-md lg:col-span-6"
    >
      <CardHeader className="px-5 pb-0 text-start sm:px-6">
        <CardTitle className="text-base font-semibold text-[#EAF5F2]">
          {copy.monthlySavingsResultLabel}
        </CardTitle>
        <p
          data-testid="calculator-monthly-savings"
          className="pt-1 text-3xl font-bold tabular-nums tracking-tight text-[#F6DC88] sm:text-4xl"
        >
          {formatSarMonth(result.monthlySavings)}
        </p>
      </CardHeader>

      <CardContent className="space-y-5 px-5 pt-2 text-start sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/10 p-3.5">
            <p className="text-xs font-medium text-[#EAF5F2]">
              {copy.monthlyWasteResultLabel}
            </p>
            <p
              data-testid="calculator-monthly-waste"
              className="mt-1 text-lg font-bold tabular-nums text-white"
            >
              {formatSarMonth(result.monthlyWasteCost)}
            </p>
          </div>

          <div className="rounded-xl bg-white/10 p-3.5">
            <p className="text-xs font-medium text-[#EAF5F2]">
              {copy.annualSavingsResultLabel}
            </p>
            <p
              data-testid="calculator-yearly-savings"
              className="mt-1 text-lg font-bold tabular-nums text-white"
            >
              {formatSarYear(result.yearlySavings)}
            </p>
          </div>
        </div>

        {/* Plan threshold comparison (400 / 700 / 1,200 SAR) */}
        <div className="space-y-3 rounded-xl border border-white/15 bg-brand-mid-teal/70 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#F6DC88]">
            {copy.planComparisonTitle}
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {planPills.map((tier) => {
              const isActive = tier.id === result.recommendedPlanId;
              return (
                <div
                  key={tier.id}
                  data-active={isActive ? "true" : "false"}
                  className={cn(
                    "min-w-0 rounded-lg border px-2.5 py-2 text-start transition-colors",
                    isActive
                      ? "border-brand-gold bg-white text-brand-dark-teal shadow-xs"
                      : "border-white/25 bg-brand-dark-teal/55 text-[#EAF5F2]",
                  )}
                >
                  <p className="truncate text-xs font-bold">
                    {copy.tierNames[tier.id]}
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums">
                    {interpolateTemplate(copy.sarAmountTemplate, {
                      amount: formatInt(tier.price),
                    })}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5 border-t border-white/15 pt-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[#EAF5F2]">
                {copy.recommendedPlanLabel}:{" "}
                <strong className="text-white">{recommendedPlanName}</strong>{" "}
                <span className="text-xs text-[#EAF5F2]">
                  ({recommendedPlanThreshold})
                </span>
              </span>
              <span
                data-testid="calculator-plan-price"
                className="font-bold tabular-nums text-white"
              >
                {formatSarMonth(result.recommendedPlanPrice)}
              </span>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-[#EAF5F2]">
                {copy.netAfterPlanLabel}
              </span>
              <span
                data-testid="calculator-net-after-plan"
                className="text-lg font-bold tabular-nums text-[#F6DC88]"
              >
                {formatSarMonth(result.netMonthlyAfterPlan)}
              </span>
            </div>

            {!result.coversPlanCost ? (
              <p
                data-testid="calculator-below-plan-note"
                className="text-xs leading-relaxed text-[#FEF3C7]"
              >
                {belowPlanNote}
              </p>
            ) : null}
          </div>
        </div>

        <p className="text-xs leading-relaxed text-[#EAF5F2]">
          {copy.disclaimer}
        </p>

        <PilotCtaLink
          locale={locale}
          location="calculator"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-gold px-5 py-3 text-base font-bold text-brand-text shadow-md transition-colors hover:bg-[#d8b136] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span>{copy.cta}</span>
          <DirectionalArrowIcon />
        </PilotCtaLink>
      </CardContent>
    </Card>
  );
}
