"use client";

import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, type SupportedLocale } from "@/lib/format";
import type { AdminOverviewDto } from "../types";

interface AdminStatsProps {
  overview: AdminOverviewDto;
}

export function AdminStats({ overview }: AdminStatsProps) {
  const t = useTranslations("admin");
  const locale = useLocale() as SupportedLocale;

  const totalTenants = overview.customers.length;
  const activeCount = overview.customers.filter(
    (c) => c.status === "ACTIVE" || c.status === "TRIAL",
  ).length;
  const suspendedCount = overview.customers.filter(
    (c) => c.status === "SUSPENDED",
  ).length;
  const totalEntries7d = overview.customers.reduce(
    (sum, c) => sum + c.entriesLast7Days,
    0,
  );

  const cards = [
    {
      label: t("stats.totalTenants"),
      value: formatNumber(totalTenants, locale),
      colorClass: "text-primary",
    },
    {
      label: t("stats.activeTenants"),
      value: formatNumber(activeCount, locale),
      colorClass: "text-secondary",
    },
    {
      label: t("stats.suspendedTenants"),
      value: formatNumber(suspendedCount, locale),
      colorClass: "text-destructive",
    },
    {
      label: t("stats.entriesLast7Days"),
      value: formatNumber(totalEntries7d, locale),
      colorClass: "text-foreground",
    },
    {
      label: t("stats.flaggedWape"),
      value: formatNumber(overview.health.flaggedWapeCount, locale),
      colorClass:
        overview.health.flaggedWapeCount > 0
          ? "text-destructive"
          : "text-secondary",
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
      {cards.map((card, index) => (
        <Card
          key={card.label}
          className={`min-w-0 text-start ${index === cards.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}
        >
          <CardHeader className="px-3.5 pb-1.5 sm:px-6 sm:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3.5 sm:px-6">
            <div className={`text-xl font-bold tabular-nums sm:text-2xl ${card.colorClass}`}>
              {card.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
