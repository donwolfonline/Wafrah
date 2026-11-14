import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppLocale, getAppTranslations } from "@/i18n/request";
import { formatCurrency, formatNumber, toNumericValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardReasonRow, HeatmapCell } from "./types";

const SHIFTS = ["MORNING", "EVENING", "NIGHT"] as const;
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const HEATMAP_CELL_TONES: Record<HeatmapCell["intensity"], string> = {
  0: "bg-muted/45 text-muted-foreground border-border/60",
  1: "bg-primary/15 text-foreground border-primary/20",
  2: "bg-primary/35 text-foreground border-primary/30",
  3: "bg-secondary text-secondary-foreground border-secondary",
  4: "bg-primary text-primary-foreground border-primary font-semibold",
};

interface HeatmapReasonsGridProps {
  heatmap: {
    cells: HeatmapCell[];
    maxCellSar: string;
  };
  reasons: DashboardReasonRow[];
}

export async function HeatmapReasonsGrid({
  heatmap,
  reasons,
}: HeatmapReasonsGridProps) {
  const locale = await getAppLocale();
  const t = await getAppTranslations("dashboard");
  const tWaste = await getAppTranslations("waste");

  const cellLookup = new Map(
    heatmap.cells.map((c) => [`${c.weekday}|${c.shift}`, c]),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card
        data-testid="dashboard-heatmap"
        className="lg:col-span-7 text-start"
      >
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg text-primary">
              {t("heatmap.title")}
            </CardTitle>
            <CardDescription>{t("heatmap.description")}</CardDescription>
          </div>
          <div
            aria-label={t("heatmap.title")}
            className="flex shrink-0 items-center gap-1.5 pt-1 text-xs text-muted-foreground"
          >
            <span>{t("heatmap.legendLow")}</span>
            {([0, 1, 2, 3, 4] as const).map((level) => (
              <span
                key={level}
                aria-hidden="true"
                className={cn(
                  "size-4 rounded-sm border",
                  HEATMAP_CELL_TONES[level],
                )}
              />
            ))}
            <span>{t("heatmap.legendHigh")}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div
            role="grid"
            aria-label={t("heatmap.title")}
            className="space-y-1.5"
          >
            <div
              role="row"
              className="grid grid-cols-[minmax(3.75rem,0.9fr)_1fr_1fr_1fr] gap-1.5 text-xs font-semibold text-muted-foreground"
            >
              <div role="columnheader" className="px-1 py-1 text-start">
                {t("heatmap.weekdayHeader")}
              </div>
              {SHIFTS.map((shift) => (
                <div
                  key={shift}
                  role="columnheader"
                  className="px-1 py-1 text-center"
                >
                  {t(`heatmap.shifts.${shift}`)}
                </div>
              ))}
            </div>

            {WEEKDAYS.map((weekday) => {
              const weekdayLabel = t(`weekdays.${weekday}`);
              return (
                <div
                  key={weekday}
                  role="row"
                  className="grid grid-cols-[minmax(3.75rem,0.9fr)_1fr_1fr_1fr] items-center gap-1.5"
                >
                  <div
                    role="rowheader"
                    className="truncate px-1 text-xs font-semibold text-foreground sm:text-sm"
                  >
                    {weekdayLabel}
                  </div>
                  {SHIFTS.map((shift) => {
                    const cell = cellLookup.get(`${weekday}|${shift}`) ?? {
                      weekday,
                      shift,
                      wasteSar: "0.00",
                      entryCount: 0,
                      intensity: 0 as const,
                    };
                    const formattedFull = formatCurrency(cell.wasteSar, locale);
                    const formattedCompact =
                      toNumericValue(cell.wasteSar) > 0
                        ? formatCurrency(cell.wasteSar, locale, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })
                        : "—";

                    return (
                      <div
                        key={shift}
                        role="gridcell"
                        tabIndex={0}
                        aria-label={t("heatmap.cellAria", {
                          weekday: weekdayLabel,
                          shift: t(`heatmap.shifts.${shift}`),
                          cost: formattedFull,
                          count: cell.entryCount,
                        })}
                        title={`${formattedFull} (${t("reasons.entriesCount", { count: cell.entryCount })})`}
                        className={cn(
                          "flex min-h-10 items-center justify-center rounded-md border px-1.5 py-1.5 text-xs tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                          HEATMAP_CELL_TONES[cell.intensity],
                        )}
                      >
                        <span className="truncate">{formattedCompact}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card
        data-testid="dashboard-reasons-card"
        className="lg:col-span-5 text-start"
      >
        <CardHeader>
          <CardTitle className="text-lg text-primary">
            {t("reasons.title")}
          </CardTitle>
          <CardDescription>{t("reasons.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {reasons.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              {t("reasons.empty")}
            </div>
          ) : (
            <ol className="space-y-3.5">
              {reasons.map((item, idx) => {
                const widthPct = Math.max(
                  2,
                  Math.min(100, toNumericValue(item.sharePct)),
                );
                return (
                  <li key={item.reason} className="space-y-1.5">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2 text-sm">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-primary tabular-nums">
                          {idx + 1}
                        </span>
                        <span>{tWaste(`reasons.${item.reason}`)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs tabular-nums">
                        <span className="text-muted-foreground">
                          {t("reasons.entriesCount", { count: item.entryCount })}
                        </span>
                        <span className="font-semibold text-foreground">
                          {formatCurrency(item.sarCost, locale)}
                        </span>
                        <span className="font-medium text-primary">
                          (
                          {formatNumber(item.sharePct, locale, {
                            maximumFractionDigits: 1,
                          })}
                          %)
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-secondary transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
