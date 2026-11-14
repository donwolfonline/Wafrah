import { LANDING_SOURCES } from "@/config/sources";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/request";
import { RevealOnScroll } from "./reveal-on-scroll";

interface StatCopy {
  figure: string;
  description: string;
  sourceRef: string;
}

interface ProblemStatsProps {
  locale: AppLocale;
  heading: string;
  stat1: StatCopy;
  stat2: StatCopy;
  calloutText: string;
  sourcesHeading: string;
  placeholderNotice: string;
  referenceLabels: {
    ref1: string;
    ref2: string;
  };
  pendingBadge: string;
  openSourceLabel: string;
}

export function ProblemStats({
  locale,
  heading,
  stat1,
  stat2,
  calloutText,
  sourcesHeading,
  placeholderNotice,
  referenceLabels,
  pendingBadge,
  openSourceLabel,
}: ProblemStatsProps) {
  const stats = [
    { ...stat1, targetId: "source-1" },
    { ...stat2, targetId: "source-2" },
  ];

  return (
    <section
      id="problem"
      className="scroll-mt-20 bg-brand-light-tint px-4 py-14 text-brand-text sm:px-6 sm:py-20"
    >
      <div className="mx-auto max-w-[1100px] space-y-8">
        <RevealOnScroll>
          <div className="max-w-2xl text-start">
            <h2 className="text-2xl font-bold tracking-tight text-brand-dark-teal sm:text-3xl">
              {heading}
            </h2>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {stats.map((stat) => (
              <Card
                key={stat.targetId}
                className="border-border bg-white py-6 shadow-xs"
              >
                <CardContent className="space-y-3 px-6 text-start">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-3xl font-bold tabular-nums tracking-tight text-brand-dark-teal sm:text-4xl">
                      {stat.figure}
                    </p>
                    <a
                      href={`#${stat.targetId}`}
                      className="inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-brand-light-tint px-2 py-0.5 text-xs font-bold text-brand-dark-teal ring-1 ring-border transition-colors hover:bg-brand-dark-teal hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-mid-teal"
                    >
                      {stat.sourceRef}
                    </a>
                  </div>
                  <p className="text-base leading-relaxed text-brand-text">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <blockquote className="mt-6 rounded-xl border border-border border-s-4 border-s-brand-gold bg-white px-6 py-5 text-start text-lg font-semibold leading-relaxed text-brand-dark-teal shadow-xs sm:text-xl">
            {calloutText}
          </blockquote>

          <div
            id="sources"
            className="mt-6 scroll-mt-24 rounded-xl border border-border bg-white/85 p-5 text-start"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-brand-dark-teal">
                {sourcesHeading}
              </h3>
              <p className="text-xs text-muted-foreground">{placeholderNotice}</p>
            </div>
            <ol className="mt-3 space-y-2.5 text-sm">
              {LANDING_SOURCES.map((source) => {
                const title =
                  locale === "ar" ? source.titleAr : source.titleEn;
                const refLabel =
                  source.number === 1
                    ? referenceLabels.ref1
                    : referenceLabels.ref2;
                return (
                  <li
                    key={source.id}
                    id={`source-${source.number}`}
                    className="flex flex-col gap-2 rounded-lg border border-border/80 bg-brand-light-tint/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="flex flex-wrap items-center gap-2 text-brand-text">
                      <span className="font-bold text-brand-dark-teal">
                        [{source.number}] {refLabel}:
                      </span>
                      <span className="text-xs sm:text-sm">{title}</span>
                      {source.publisherYear ? (
                        <span className="text-xs text-muted-foreground">
                          ({source.publisherYear})
                        </span>
                      ) : null}
                    </span>

                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs font-semibold text-brand-mid-teal underline hover:text-brand-dark-teal"
                      >
                        {openSourceLabel}
                      </a>
                    ) : (
                      <Badge variant="outline" className="w-fit shrink-0 text-[11px]">
                        {pendingBadge}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
