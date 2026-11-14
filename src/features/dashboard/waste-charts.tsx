"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatCurrency,
  formatNumber,
  type SupportedLocale,
  toNumericValue,
} from "@/lib/format";
import type { DailyWasteTrendPoint, ItemWasteBarDatum } from "./types";

const TIER_COLORS: Record<ItemWasteBarDatum["tier"], string> = {
  HIGH: "#c62828",
  MEDIUM: "#c9a227",
  LOW: "#0e6b5c",
};

interface WasteChartsProps {
  dailyTrend: DailyWasteTrendPoint[];
  itemBars: ItemWasteBarDatum[];
}

export function WasteCharts({ dailyTrend, itemBars }: WasteChartsProps) {
  const locale = useLocale() as SupportedLocale;
  const t = useTranslations("dashboard");
  const isRtl = locale === "ar";

  const hasTrendWaste = dailyTrend.some(
    (d) => toNumericValue(d.wasteSar) > 0,
  );

  const lineData = dailyTrend.map((point) => ({
    dateKey: point.dateKey,
    shortDate: point.dateKey.slice(5),
    wasteSar: toNumericValue(point.wasteSar),
    movingAvg7dSar: toNumericValue(point.movingAvg7dSar),
  }));

  const barData = itemBars.map((item) => ({
    menuItemId: item.menuItemId,
    label: locale === "ar" ? item.nameAr : item.name,
    wasteSar: toNumericValue(item.wasteSar),
    sharePct: item.sharePct,
    tier: item.tier,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card
        data-testid="dashboard-trend-chart"
        className="lg:col-span-7 text-start"
      >
        <CardHeader>
          <CardTitle className="text-lg text-primary">
            {t("trend.title")}
          </CardTitle>
          <CardDescription>{t("trend.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasTrendWaste ? (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              {t("trend.empty")}
            </div>
          ) : (
            <div className="h-72 w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={lineData}
                  margin={{ top: 10, right: 16, left: 4, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#cde0da" />
                  <XAxis
                    dataKey="shortDate"
                    tick={{ fontSize: 11, fill: "#3b5952" }}
                    minTickGap={20}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#3b5952" }}
                    width={52}
                    tickFormatter={(v: number) =>
                      formatNumber(v, locale, { maximumFractionDigits: 0 })
                    }
                  />
                  <Tooltip
                    wrapperStyle={{ direction: isRtl ? "rtl" : "ltr" }}
                    itemStyle={{ color: "#1a1a1a" }}
                    labelStyle={{ color: "#0b4f45", fontWeight: 600 }}
                    formatter={(value, name) => [
                      formatCurrency(
                        typeof value === "number" || typeof value === "string"
                          ? value
                          : 0,
                        locale,
                      ),
                      String(name),
                    ]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.dateKey ?? ""
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="wasteSar"
                    name={t("trend.dailySeries")}
                    stroke="#0e6b5c"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="movingAvg7dSar"
                    name={t("trend.movingAvg7d")}
                    stroke="#c9a227"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card
        data-testid="dashboard-items-chart"
        className="lg:col-span-5 text-start"
      >
        <CardHeader>
          <CardTitle className="text-lg text-primary">
            {t("itemsChart.title")}
          </CardTitle>
          <CardDescription>{t("itemsChart.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {barData.length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              {t("itemsChart.empty")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: TIER_COLORS.HIGH }}
                  />
                  {t("itemsChart.tierHigh")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: TIER_COLORS.MEDIUM }}
                  />
                  {t("itemsChart.tierMedium")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: TIER_COLORS.LOW }}
                  />
                  {t("itemsChart.tierLow")}
                </span>
              </div>
              <div className="h-64 w-full min-w-0" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#cde0da"
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#3b5952" }}
                      tickFormatter={(v: number) =>
                        formatNumber(v, locale, { maximumFractionDigits: 0 })
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={148}
                      tick={{ fontSize: 11, fill: "#1a1a1a" }}
                      tickFormatter={(label: string) =>
                        label.length > 24 ? `${label.slice(0, 23)}…` : label
                      }
                    />
                    <Tooltip
                      wrapperStyle={{ direction: isRtl ? "rtl" : "ltr" }}
                      itemStyle={{ color: "#1a1a1a" }}
                      labelStyle={{ color: "#0b4f45", fontWeight: 600 }}
                      formatter={(value) => [
                        formatCurrency(
                          typeof value === "number" || typeof value === "string"
                            ? value
                            : 0,
                          locale,
                        ),
                        t("kpis.wasteCostTitle"),
                      ]}
                    />
                    <Bar dataKey="wasteSar" radius={[0, 4, 4, 0]}>
                      {barData.map((entry) => (
                        <Cell
                          key={entry.menuItemId}
                          fill={TIER_COLORS[entry.tier]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
