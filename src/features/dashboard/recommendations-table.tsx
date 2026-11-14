"use client";

import { ChevronDown, HelpCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatNumber,
  type SupportedLocale,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  RecommendationsMobileList,
  RecommendationWhyPanel,
} from "./recommendations-mobile-list";
import type { RecommendationItemRow } from "./types";

interface RecommendationsTableProps {
  horizonDates: string[];
  items: RecommendationItemRow[];
}

export function RecommendationsTable({
  horizonDates,
  items,
}: RecommendationsTableProps) {
  const locale = useLocale() as SupportedLocale;
  const t = useTranslations("dashboard");
  const tUnits = useTranslations("waste.units");

  const [selectedDay, setSelectedDay] = useState<string>("ALL");
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  function toggleWhy(rowKey: string) {
    setExpandedKeys((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  }

  return (
    <Card
      data-testid="dashboard-recommendations-card"
      className="text-start"
    >
      <CardHeader className="space-y-3">
        <div className="space-y-1">
          <CardTitle className="text-lg text-primary">
            {t("recommendations.title")}
          </CardTitle>
          <CardDescription>{t("recommendations.description")}</CardDescription>
        </div>

        {horizonDates.length > 0 ? (
          <div
            role="group"
            aria-label={t("recommendations.columns.day")}
            className="flex flex-wrap gap-1.5"
          >
            <Button
              type="button"
              size="sm"
              variant={selectedDay === "ALL" ? "default" : "outline"}
              onClick={() => setSelectedDay("ALL")}
            >
              {t("recommendations.allDays")}
            </Button>
            {horizonDates.map((dateKey) => {
              const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
              return (
                <Button
                  key={dateKey}
                  type="button"
                  size="sm"
                  variant={selectedDay === dateKey ? "default" : "outline"}
                  onClick={() => setSelectedDay(dateKey)}
                  className="tabular-nums"
                >
                  {t(`weekdays.${weekday}`)} {dateKey.slice(5)}
                </Button>
              );
            })}
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {items.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed py-8 text-sm text-muted-foreground">
            {t("recommendations.emptyItems")}
          </div>
        ) : (
          <>
            <div className="md:hidden">
              <RecommendationsMobileList
                items={items}
                selectedDay={selectedDay}
                expandedKeys={expandedKeys}
                onToggleWhy={toggleWhy}
              />
            </div>

            <div className="hidden md:block">
              <Table data-testid="dashboard-recommendations-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("recommendations.columns.item")}</TableHead>
                    <TableHead>{t("recommendations.columns.day")}</TableHead>
                    <TableHead>{t("recommendations.columns.recommended")}</TableHead>
                    <TableHead>{t("recommendations.columns.range")}</TableHead>
                    <TableHead className="text-end">
                      {t("recommendations.columns.why")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const itemLabel = locale === "ar" ? item.nameAr : item.name;
                    const unitLabel = tUnits(item.unit);

                    if (item.status === "INSUFFICIENT_DATA") {
                      return (
                        <TableRow
                          key={item.menuItemId}
                          data-testid={`rec-insufficient-${item.code ?? item.menuItemId}`}
                        >
                          <TableCell className="font-medium">{itemLabel}</TableCell>
                          <TableCell colSpan={4}>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>{t("recommendations.insufficientData")}</span>
                              <Badge variant="outline" className="tabular-nums">
                                {t("recommendations.daysProgress", {
                                  count: item.distinctSalesDays,
                                })}
                              </Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const visibleDays =
                      selectedDay === "ALL"
                        ? item.days
                        : item.days.filter((d) => d.forDate === selectedDay);

                    return visibleDays.map((day, idx) => {
                      const rowKey = `${item.menuItemId}|${day.forDate}`;
                      const isExpanded = Boolean(expandedKeys[rowKey]);

                      return (
                        <Fragment key={rowKey}>
                          <TableRow
                            data-testid={`rec-row-${item.code ?? item.menuItemId}-${day.forDate}`}
                            className={cn(idx === 0 && "border-t-2 border-t-border")}
                          >
                            <TableCell className="font-medium">
                              {idx === 0 || selectedDay !== "ALL" ? itemLabel : ""}
                            </TableCell>
                            <TableCell className="tabular-nums text-xs sm:text-sm">
                              <span className="font-medium">
                                {t(`weekdays.${day.weekday}`)}
                              </span>{" "}
                              <span className="text-muted-foreground">
                                {day.forDate.slice(5)}
                              </span>
                            </TableCell>
                            <TableCell className="font-bold text-primary tabular-nums">
                              {formatNumber(day.recommendedQty, locale, {
                                maximumFractionDigits: 1,
                              })}{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                {unitLabel}
                              </span>
                            </TableCell>
                            <TableCell className="tabular-nums text-xs sm:text-sm text-muted-foreground">
                              {formatNumber(day.lowQty, locale, {
                                maximumFractionDigits: 1,
                              })}{" "}
                              –{" "}
                              {formatNumber(day.highQty, locale, {
                                maximumFractionDigits: 1,
                              })}{" "}
                              {unitLabel}
                            </TableCell>
                            <TableCell className="text-end">
                              <Button
                                type="button"
                                size="sm"
                                variant={isExpanded ? "secondary" : "outline"}
                                aria-expanded={isExpanded}
                                data-testid={`rec-why-btn-${item.code ?? item.menuItemId}-${day.forDate}`}
                                onClick={() => toggleWhy(rowKey)}
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
                            </TableCell>
                          </TableRow>
                          {isExpanded ? (
                            <TableRow
                              data-testid={`rec-why-detail-${item.code ?? item.menuItemId}-${day.forDate}`}
                              className="bg-muted/20 hover:bg-muted/20"
                            >
                              <TableCell colSpan={5} className="p-3">
                                <RecommendationWhyPanel
                                  day={day}
                                  unitLabel={unitLabel}
                                />
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    });
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
