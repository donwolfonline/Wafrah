"use client";

import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppLocale } from "@/i18n/request";
import { track } from "@/lib/analytics";
import { formatNumber } from "@/lib/format";
import {
  CALCULATOR_BOUNDS,
  CALCULATOR_DEFAULTS,
  calculateEstimatedSavings,
} from "./calculator-math";
import {
  SavingsCalculatorResults,
  type SavingsCalculatorCopy,
  interpolateTemplate,
} from "./savings-calculator-results";

const CALCULATOR_SESSION_KEY = "wafrah_calculator_used";

export interface SavingsCalculatorProps {
  locale: AppLocale;
  copy: SavingsCalculatorCopy;
}

export function SavingsCalculatorPanel({
  locale,
  copy,
}: SavingsCalculatorProps) {
  const [purchasesInput, setPurchasesInput] = useState<string>(
    String(CALCULATOR_DEFAULTS.monthlyPurchases),
  );
  const [wastePctInput, setWastePctInput] = useState<string>(
    String(CALCULATOR_DEFAULTS.wastePct),
  );
  const [reductionPct, setReductionPct] = useState<number>(
    CALCULATOR_DEFAULTS.reductionPct,
  );

  const trackedSessionRef = useRef(false);
  const idPrefix = "calculator";
  const purchasesInputId = `${idPrefix}-purchases-input`;
  const purchasesSliderId = `${idPrefix}-purchases-slider`;
  const purchasesHintId = `${idPrefix}-purchases-hint`;
  const wasteInputId = `${idPrefix}-waste-input`;
  const wasteHintId = `${idPrefix}-waste-hint`;
  const reductionSliderId = `${idPrefix}-reduction-slider`;
  const reductionHintId = `${idPrefix}-reduction-hint`;

  const result = useMemo(
    () =>
      calculateEstimatedSavings({
        monthlyPurchases: purchasesInput,
        wastePct: wastePctInput,
        reductionPct,
      }),
    [purchasesInput, wastePctInput, reductionPct],
  );

  function recordCalculatorUsedOnce(
    nextPurchases: string,
    nextWastePct: string,
    nextReductionPct: number,
  ) {
    if (trackedSessionRef.current) return;
    try {
      if (typeof window !== "undefined") {
        if (window.sessionStorage.getItem(CALCULATOR_SESSION_KEY) === "1") {
          trackedSessionRef.current = true;
          return;
        }
        window.sessionStorage.setItem(CALCULATOR_SESSION_KEY, "1");
      }
    } catch {
      // Ignore storage access errors in private/restricted browsers.
    }

    trackedSessionRef.current = true;
    const next = calculateEstimatedSavings({
      monthlyPurchases: nextPurchases,
      wastePct: nextWastePct,
      reductionPct: nextReductionPct,
    });
    track("calculator_used", {
      locale,
      purchasesBand: next.purchasesBand,
      reductionPct: next.reductionPct,
    });
  }

  function handlePurchasesChange(nextValue: string) {
    setPurchasesInput(nextValue);
    recordCalculatorUsedOnce(nextValue, wastePctInput, reductionPct);
  }

  function handleWastePctChange(nextValue: string) {
    setWastePctInput(nextValue);
    recordCalculatorUsedOnce(purchasesInput, nextValue, reductionPct);
  }

  function handleReductionChange(nextValue: string) {
    const parsed = Number.parseInt(nextValue, 10);
    const clamped = Number.isNaN(parsed)
      ? CALCULATOR_DEFAULTS.reductionPct
      : Math.max(
          CALCULATOR_BOUNDS.minReductionPct,
          Math.min(CALCULATOR_BOUNDS.maxReductionPct, parsed),
        );
    setReductionPct(clamped);
    recordCalculatorUsedOnce(purchasesInput, wastePctInput, clamped);
  }

  const formatInt = (value: number) =>
    formatNumber(value, locale, { maximumFractionDigits: 0 });

  const formatSarMonth = (value: number) =>
    interpolateTemplate(copy.sarPerMonthTemplate, {
      amount: formatInt(value),
    });

  const sliderPurchasesValue = Math.max(
    CALCULATOR_BOUNDS.sliderMinPurchases,
    Math.min(CALCULATOR_BOUNDS.sliderMaxPurchases, result.monthlyPurchases),
  );

  return (
    <section
      id="calculator"
      className="scroll-mt-20 bg-white px-4 py-14 text-brand-text sm:px-6 sm:py-20"
    >
      <div className="mx-auto max-w-[1100px] space-y-8">
        <div className="max-w-2xl space-y-2 text-start">
          <Badge variant="accent" className="px-3 py-1 text-xs font-bold">
            {copy.estimateBadge}
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight text-brand-dark-teal sm:text-3xl">
            {copy.heading}
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            {copy.subheading}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
          {/* Controls */}
          <Card className="min-w-0 border-border bg-brand-light-tint/55 py-6 shadow-xs lg:col-span-6">
            <CardContent className="space-y-6 px-5 text-start sm:px-6">
              {/* Monthly Purchases */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label
                    htmlFor={purchasesInputId}
                    className="text-sm font-bold text-brand-dark-teal sm:text-base"
                  >
                    {copy.purchasesLabel}
                  </Label>
                  <span className="rounded-md bg-white px-2.5 py-0.5 text-xs font-bold tabular-nums text-brand-dark-teal ring-1 ring-border">
                    {formatSarMonth(result.monthlyPurchases)}
                  </span>
                </div>

                <div className="relative flex items-center gap-2">
                  <Input
                    id={purchasesInputId}
                    type="number"
                    inputMode="numeric"
                    min={CALCULATOR_BOUNDS.minPurchases}
                    max={CALCULATOR_BOUNDS.maxPurchases}
                    step={500}
                    dir="ltr"
                    value={purchasesInput}
                    aria-describedby={purchasesHintId}
                    onChange={(event) => handlePurchasesChange(event.target.value)}
                    onBlur={() => setPurchasesInput(String(result.monthlyPurchases))}
                    className="h-11 bg-white text-base font-semibold tabular-nums text-brand-text"
                  />
                  <span className="shrink-0 text-sm font-semibold text-brand-dark-teal">
                    {copy.sarUnit}
                  </span>
                </div>

                <input
                  id={purchasesSliderId}
                  type="range"
                  aria-label={copy.purchasesRangeLabel}
                  aria-describedby={purchasesHintId}
                  min={CALCULATOR_BOUNDS.sliderMinPurchases}
                  max={CALCULATOR_BOUNDS.sliderMaxPurchases}
                  step={CALCULATOR_BOUNDS.sliderStepPurchases}
                  value={sliderPurchasesValue}
                  onChange={(event) => handlePurchasesChange(event.target.value)}
                  className="h-10 w-full cursor-pointer rounded-md accent-brand-dark-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-mid-teal focus-visible:ring-offset-2"
                />
                <div className="flex justify-between text-xs font-medium tabular-nums text-muted-foreground">
                  <span>{formatInt(CALCULATOR_BOUNDS.sliderMinPurchases)}</span>
                  <span>{formatInt(CALCULATOR_BOUNDS.sliderMaxPurchases)}</span>
                </div>
                <p id={purchasesHintId} className="text-xs text-muted-foreground">
                  {copy.purchasesHint}
                </p>
              </div>

              {/* Current Waste % */}
              <div className="space-y-2 border-t border-border pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label
                    htmlFor={wasteInputId}
                    className="text-sm font-bold text-brand-dark-teal sm:text-base"
                  >
                    {copy.wastePctLabel}
                  </Label>
                  <span
                    dir="ltr"
                    className="rounded-md bg-white px-2.5 py-0.5 text-xs font-bold tabular-nums text-brand-dark-teal ring-1 ring-border"
                  >
                    {formatInt(result.wastePct)}%
                  </span>
                </div>

                <div className="relative flex items-center gap-2">
                  <Input
                    id={wasteInputId}
                    type="number"
                    inputMode="decimal"
                    min={CALCULATOR_BOUNDS.minWastePct}
                    max={CALCULATOR_BOUNDS.maxWastePct}
                    step={1}
                    dir="ltr"
                    value={wastePctInput}
                    aria-describedby={wasteHintId}
                    onChange={(event) => handleWastePctChange(event.target.value)}
                    onBlur={() => setWastePctInput(String(result.wastePct))}
                    className="h-11 bg-white text-base font-semibold tabular-nums text-brand-text"
                  />
                  <span className="shrink-0 text-sm font-semibold text-brand-dark-teal">
                    %
                  </span>
                </div>
                <p id={wasteHintId} className="text-xs font-medium text-brand-mid-teal">
                  {copy.wastePctHint}
                </p>
              </div>

              {/* Expected Reduction % */}
              <div className="space-y-2 border-t border-border pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label
                    htmlFor={reductionSliderId}
                    className="text-sm font-bold text-brand-dark-teal sm:text-base"
                  >
                    {copy.reductionPctLabel}
                  </Label>
                  <span
                    dir="ltr"
                    className="rounded-md bg-brand-gold px-2.5 py-0.5 text-xs font-bold tabular-nums text-brand-text"
                  >
                    {formatInt(reductionPct)}%
                  </span>
                </div>

                <input
                  id={reductionSliderId}
                  type="range"
                  aria-describedby={reductionHintId}
                  min={CALCULATOR_BOUNDS.minReductionPct}
                  max={CALCULATOR_BOUNDS.maxReductionPct}
                  step={1}
                  value={reductionPct}
                  onChange={(event) => handleReductionChange(event.target.value)}
                  className="h-10 w-full cursor-pointer rounded-md accent-brand-dark-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-mid-teal focus-visible:ring-offset-2"
                />
                <div className="flex justify-between text-xs font-medium tabular-nums text-muted-foreground">
                  <bdi dir="ltr">{formatInt(CALCULATOR_BOUNDS.minReductionPct)}%</bdi>
                  <bdi dir="ltr">{formatInt(CALCULATOR_BOUNDS.maxReductionPct)}%</bdi>
                </div>
                <p id={reductionHintId} className="text-xs font-medium text-brand-mid-teal">
                  {copy.reductionPctHint}
                </p>
              </div>

              {result.wasClamped ? (
                <p
                  role="status"
                  className="rounded-lg border border-brand-gold/60 bg-white px-3 py-2 text-xs font-medium text-brand-dark-teal"
                >
                  {copy.clampedNotice}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* Live Outputs + Plan Comparison */}
          <SavingsCalculatorResults
            locale={locale}
            copy={copy}
            result={result}
          />
        </div>
      </div>
    </section>
  );
}
