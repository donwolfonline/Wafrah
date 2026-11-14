"use client";

import { ChevronDown, HelpCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatNumber,
  type SupportedLocale,
  toNumericValue,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RecommendationDayCell, RecommendationItemRow } from "./types";

interface RecommendationWhyPanelProps {
  day: RecommendationDayCell;
  unitLabel: string;
}

export function RecommendationWhyPanel({
  day,
  unitLabel,
}: RecommendationWhyPanelProps) {
  const locale = useLocale() as SupportedLocale;
  const t = useTranslations("dashboard");
  const w = day.why;

  const safetyNum = w.safetyMarginQty ? toNumericValue(w.safetyMarginQty) : 0;
  const safetyPrefix = safetyNum > 0 ? "+" : safetyNum < 0 ? "-" : "";
  const safetyFormatted = `${safetyPrefix}${formatNumber(Math.abs(safetyNum), locale, { maximumFractionDigits: 2 })} ${unitLabel}`;

  const eventDisplay =
    w.eventMultiplier && toNumericValue(w.eventMultiplier) !== 1
      ? `${formatNumber(w.eventMultiplier, locale, { maximumFractionDigits: 2 })}×${w.eventName || w.eventNameAr ? ` (${locale === "ar" ? (w.eventNameAr ?? w.eventName) : (w.eventName ?? w.eventNameAr)})` : ""}`
      : t("recommendations.whyFields.noEvent");

  return (
    <div className="grid gap-2.5 rounded-lg bg-muted/45 p-3 text-xs sm:grid-cols-2 lg:grid-cols-5 text-start">
      <div>
        <div className="text-muted-foreground">
          {t("recommendations.whyFields.weekdayMean")}
        </div>
        <div className="mt-0.5 font-semibold text-foreground tabular-nums">
          {w.weekdayMean
            ? `${formatNumber(w.weekdayMean, locale, { maximumFractionDigits: 1 })} ${unitLabel}`
            : "—"}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">
          {t("recommendations.whyFields.eventMultiplier")}
        </div>
        <div className="mt-0.5 font-semibold text-foreground tabular-nums">
          {eventDisplay}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">
          {t("recommendations.whyFields.trend")}
        </div>
        <div className="mt-0.5 font-semibold text-foreground tabular-nums">
          {w.trendFactor
            ? `${formatNumber(w.trendFactor, locale, { maximumFractionDigits: 2 })}×`
            : "—"}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">
          {t("recommendations.whyFields.safetyMargin")}
        </div>
        <div className="mt-0.5 font-semibold text-primary tabular-nums">
          {safetyFormatted}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">
          {t("recommendations.whyFields.criticalRatio")}
        </div>
        <div className="mt-0.5 font-semibold text-foreground tabular-nums">
          {w.criticalRatio
            ? formatNumber(w.criticalRatio, locale, {
                maximumFractionDigits: 2,
              })
            : "—"}
        </div>
      </div>
    </div>
  );
}

interface RecommendationsMobileListProps {
  items: RecommendationItemRow[];
  selectedDay: string;
  expandedKeys: Record<string, boolean>;
  onToggleWhy: (rowKey: string) => void;
}

export function RecommendationsMobileList({
  items,
  selectedDay,
  expandedKeys,
  onToggleWhy,
}: RecommendationsMobileListProps) {
  const locale = useLocale() as SupportedLocale;
  const t = useTranslations("dashboard");
  const tUnits = useTranslations("waste.units");

  return (
    <div data-testid="dashboard-recommendations-mobile" className="space-y-3">
      {items.map((item) => {
        const itemLabel = locale === "ar" ? item.nameAr : item.name;
        const unitLabel = tUnits(item.unit);

        if (item.status === "INSUFFICIENT_DATA") {
          return (
            <div
              key={item.menuItemId}
              className="space-y-2 rounded-lg border p-3 text-start"
            >
              <div className="text-sm font-semibold">{itemLabel}</div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{t("recommendations.insufficientData")}</span>
                <Badge variant="outline" className="tabular-nums">
                  {t("recommendations.daysProgress", {
                    count: item.distinctSalesDays,
                  })}
                </Badge>
              </div>
            </div>
          );
        }

        const visibleDays =
          selectedDay === "ALL"
            ? item.days
            : item.days.filter((d) => d.forDate === selectedDay);

        return (
          <div
            key={item.menuItemId}
            className="overflow-hidden rounded-lg border bg-card text-start"
          >
            <div className="border-b bg-muted/35 px-3 py-2 text-sm font-semibold text-foreground">
              {itemLabel}
            </div>
            <div className="divide-y">
              {visibleDays.map((day) => {
                const rowKey = `${item.menuItemId}|${day.forDate}`;
                const isExpanded = Boolean(expandedKeys[rowKey]);

                return (
                  <div key={rowKey} className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-0.5 text-xs">
                        <div className="font-medium text-foreground tabular-nums">
                          {t(`weekdays.${day.weekday}`)}{" "}
                          <span className="text-muted-foreground">
                            {day.forDate.slice(5)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
                          <span className="text-sm font-bold text-primary">
                            {formatNumber(day.recommendedQty, locale, {
                              maximumFractionDigits: 1,
                            })}{" "}
                            {unitLabel}
                          </span>
                          <span className="text-muted-foreground">
                            (
                            {formatNumber(day.lowQty, locale, {
                              maximumFractionDigits: 1,
                            })}
                            –
                            {formatNumber(day.highQty, locale, {
                              maximumFractionDigits: 1,
                            })}
                            )
                          </span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant={isExpanded ? "secondary" : "outline"}
                        aria-expanded={isExpanded}
                        onClick={() => onToggleWhy(rowKey)}
                        className="shrink-0"
                      >
                        <HelpCircle className="me-1 size-3.5" />
                        <span>{t("recommendations.whyButton")}</span>
                        <ChevronDown
                          className={cn(
                            "ms-1 size-3.5 transition-transform",
                            isExpanded && "rotate-180",
                          )}
                        />
                      </Button>
                    </div>
                    {isExpanded ? (
                      <RecommendationWhyPanel
                        day={day}
                        unitLabel={unitLabel}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
