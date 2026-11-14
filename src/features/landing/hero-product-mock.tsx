import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface HeroMockCopy {
  frameRegionLabel: string;
  urlLabel: string;
  demoBadge: string;
  dashboardTitle: string;
  kpiWasteLabel: string;
  kpiWasteValue: string;
  kpiDeltaValue: string;
  kpiShareLabel: string;
  kpiShareValue: string;
  kpiTopDriverLabel: string;
  kpiTopDriverValue: string;
  chartTitle: string;
  chartWeek1: string;
  chartWeek2: string;
  chartWeek3: string;
  chartWeek4: string;
  phoneFrameLabel: string;
  phoneTitle: string;
  phoneShiftBadge: string;
  phoneOfflineReady: string;
  phoneItemLabel: string;
  phoneQty1: string;
  phoneQty2: string;
  phoneQty3: string;
  phoneReason1: string;
  phoneReason2: string;
  phoneSubmit: string;
}

interface HeroProductMockProps {
  copy: HeroMockCopy;
}

const CHART_BAR_HEIGHTS = [72, 60, 48, 36] as const;

export function HeroProductMock({ copy }: HeroProductMockProps) {
  const weeks = [
    copy.chartWeek1,
    copy.chartWeek2,
    copy.chartWeek3,
    copy.chartWeek4,
  ];

  return (
    <div
      role="group"
      aria-label={copy.frameRegionLabel}
      className="relative mx-auto w-full max-w-[540px] lg:max-w-none"
    >
      {/* Browser dashboard frame */}
      <div className="overflow-hidden rounded-2xl border border-white/20 bg-white text-brand-text shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-brand-light-tint px-3.5 py-2.5">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-[#D97757]" />
            <span className="size-2.5 rounded-full bg-brand-gold" />
            <span className="size-2.5 rounded-full bg-brand-mid-teal" />
          </div>
          <span
            dir="ltr"
            className="truncate rounded border border-border bg-white px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            {copy.urlLabel}
          </span>
          <Badge variant="accent" className="text-[11px] font-semibold">
            {copy.demoBadge}
          </Badge>
        </div>

        <Card className="gap-3.5 rounded-none border-0 py-4 shadow-none">
          <CardHeader className="px-4 pb-0">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-bold text-brand-dark-teal sm:text-base">
                {copy.dashboardTitle}
              </CardTitle>
              <Badge
                variant="outline"
                className="border-border text-[11px] text-brand-dark-teal"
              >
                {copy.demoBadge}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-3.5 px-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-brand-light-tint p-2.5 text-start">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {copy.kpiWasteLabel}
                </p>
                <p className="mt-1 text-base font-bold tabular-nums text-brand-dark-teal sm:text-lg">
                  <bdi dir="ltr">{copy.kpiWasteValue}</bdi>
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-brand-mid-teal">
                  {copy.kpiDeltaValue}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-brand-light-tint p-2.5 text-start">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {copy.kpiShareLabel}
                </p>
                <p className="mt-1 text-base font-bold tabular-nums text-brand-dark-teal sm:text-lg">
                  <bdi dir="ltr">{copy.kpiShareValue}</bdi>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {copy.demoBadge}
                </p>
              </div>

              <div className="col-span-2 rounded-lg border border-border bg-brand-light-tint p-2.5 text-start sm:col-span-1">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {copy.kpiTopDriverLabel}
                </p>
                <p className="mt-1 text-xs font-bold leading-snug text-brand-dark-teal sm:text-sm">
                  {copy.kpiTopDriverValue}
                </p>
              </div>
            </div>

            {/* Bottom split: Trend chart + Kitchen phone frame side-by-side cleanly on sm+ */}
            <div className="grid gap-3.5 sm:grid-cols-12 sm:items-stretch">
              <div className="flex flex-col justify-between rounded-lg border border-border bg-brand-light-tint/70 p-3 sm:col-span-6">
                <p className="text-start text-xs font-semibold text-brand-dark-teal">
                  {copy.chartTitle}
                </p>

                <div className="mt-3 grid grid-cols-4 items-end gap-2.5 border-b border-border pb-1.5 pt-3">
                  {CHART_BAR_HEIGHTS.map((height, idx) => {
                    const isLatest = idx === CHART_BAR_HEIGHTS.length - 1;
                    return (
                      <div
                        key={idx}
                        className="flex h-20 flex-col items-center justify-end"
                      >
                        <div
                          aria-hidden="true"
                          style={{ height: `${height}px` }}
                          className={
                            isLatest
                              ? "w-full max-w-8 rounded-t-md bg-brand-gold"
                              : idx === 2
                                ? "w-full max-w-8 rounded-t-md bg-brand-mid-teal"
                                : "w-full max-w-8 rounded-t-md bg-brand-dark-teal"
                          }
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="mt-1.5 grid grid-cols-4 gap-2.5 text-center text-[11px] font-semibold text-muted-foreground">
                  {weeks.map((week, i) => (
                    <span key={i}>{week}</span>
                  ))}
                </div>
              </div>

              {/* Mobile big-button kitchen logging frame */}
              <div
                role="group"
                aria-label={copy.phoneFrameLabel}
                className="flex flex-col justify-between rounded-xl border-2 border-brand-gold bg-white p-3 text-brand-text shadow-md sm:col-span-6"
              >
                <div className="mb-2.5 flex flex-wrap items-start justify-between gap-1.5 border-b border-border pb-2">
                  <div className="text-start">
                    <p className="text-xs font-bold text-brand-dark-teal">
                      {copy.phoneTitle}
                    </p>
                    <p className="text-[10px] font-medium text-brand-mid-teal">
                      {copy.phoneOfflineReady}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant="secondary" className="px-1.5 py-0.5 text-[10px]">
                      {copy.phoneShiftBadge}
                    </Badge>
                    <Badge
                      variant="accent"
                      className="px-1.5 py-0.5 text-[10px] font-semibold"
                    >
                      {copy.demoBadge}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2 text-start">
                  <div className="rounded-lg bg-brand-dark-teal px-2.5 py-2 text-xs font-semibold text-white">
                    {copy.phoneItemLabel}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] font-semibold">
                    <span className="rounded-md border border-border bg-brand-light-tint px-1 py-1.5 text-brand-dark-teal">
                      {copy.phoneQty1}
                    </span>
                    <span className="rounded-md border border-brand-gold bg-brand-gold px-1 py-1.5 text-brand-text">
                      {copy.phoneQty2}
                    </span>
                    <span className="rounded-md border border-border bg-brand-light-tint px-1 py-1.5 text-brand-dark-teal">
                      {copy.phoneQty3}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-center text-[11px] font-medium">
                    <span className="rounded-md bg-brand-mid-teal px-2 py-1.5 text-white">
                      {copy.phoneReason1}
                    </span>
                    <span className="rounded-md border border-border bg-white px-2 py-1.5 text-brand-dark-teal">
                      {copy.phoneReason2}
                    </span>
                  </div>

                  <div className="rounded-lg bg-brand-dark-teal px-3 py-2 text-center text-xs font-bold text-white">
                    {copy.phoneSubmit}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
