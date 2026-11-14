import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/request";
import { CheckCircleIcon, DirectionalArrowIcon } from "./landing-icons";
import { PilotCtaLink } from "./pilot-cta-link";
import { RevealOnScroll } from "./reveal-on-scroll";

export interface PricingTierItem {
  id: string;
  name: string;
  price: string;
  summary: string;
  features: ReadonlyArray<string>;
}

interface PilotPricingProps {
  locale: AppLocale;
  heading: string;
  subheading: string;
  pilotOfferBadge: string;
  pilotOfferNote: string;
  periodLabel: string;
  vatNote: string;
  ctaLabel: string;
  tiers: ReadonlyArray<PricingTierItem>;
}

export function PilotPricing({
  locale,
  heading,
  subheading,
  pilotOfferBadge,
  pilotOfferNote,
  periodLabel,
  vatNote,
  ctaLabel,
  tiers,
}: PilotPricingProps) {
  const cleanVatNote = vatNote.trim();

  return (
    <section
      id="pricing"
      className="scroll-mt-20 bg-brand-dark-teal px-4 py-14 text-white sm:px-6 sm:py-20"
    >
      <div className="mx-auto max-w-[1100px]">
        <RevealOnScroll className="space-y-8">
          <div className="max-w-2xl space-y-2 text-start">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {heading}
            </h2>
            <p className="text-base leading-relaxed text-[#E4F2EE]">
              {subheading}
            </p>
          </div>

          {/* Highlighted Founding Pilot Callout */}
          <div className="rounded-2xl border-2 border-brand-gold bg-brand-mid-teal p-5 text-start shadow-lg sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full bg-brand-gold px-3.5 py-1 text-xs font-bold text-brand-text sm:text-sm">
                  {pilotOfferBadge}
                </span>
                <p className="max-w-2xl text-sm leading-relaxed text-white sm:text-base">
                  {pilotOfferNote}
                </p>
              </div>
              <PilotCtaLink
                locale={locale}
                location="pricing"
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-gold px-5 py-2.5 text-sm font-bold text-brand-text shadow-xs transition-colors hover:bg-[#d8b136] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span>{ctaLabel}</span>
                <DirectionalArrowIcon />
              </PilotCtaLink>
            </div>
          </div>

          {/* 3 Subscription Tiers */}
          <div className="grid gap-4 md:grid-cols-3 lg:gap-5">
            {tiers.map((tier) => (
              <Card
                key={tier.id}
                className="flex h-full flex-col justify-between border-white/15 bg-white py-5 text-brand-text shadow-md lg:py-6"
              >
                <div className="space-y-4">
                  <CardHeader className="px-4 pb-0 text-start lg:px-6">
                    <CardTitle className="text-lg font-bold text-brand-dark-teal">
                      {tier.name}
                    </CardTitle>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-2">
                      <span className="text-3xl font-bold tabular-nums tracking-tight text-brand-dark-teal">
                        {tier.price}
                      </span>
                      <span className="whitespace-nowrap text-xs font-medium text-muted-foreground lg:text-sm">
                        {periodLabel}
                      </span>
                    </div>
                    <p className="pt-1 text-sm leading-relaxed text-muted-foreground">
                      {tier.summary}
                    </p>
                  </CardHeader>

                  <CardContent className="px-4 lg:px-6">
                    <ul className="space-y-2.5 text-start text-sm text-brand-text">
                      {tier.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <CheckCircleIcon className="mt-0.5 text-brand-mid-teal" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </div>

                <CardFooter className="px-4 pt-2 lg:px-6">
                  <PilotCtaLink
                    locale={locale}
                    location="pricing"
                    className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-dark-teal px-3 py-2.5 text-center text-xs font-semibold text-white transition-colors hover:bg-brand-mid-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-mid-teal lg:gap-2 lg:px-4 lg:text-sm"
                  >
                    <span>{ctaLabel}</span>
                    <DirectionalArrowIcon />
                  </PilotCtaLink>
                </CardFooter>
              </Card>
            ))}
          </div>

          {cleanVatNote.length > 0 ? (
            <p className="text-start text-xs text-[#DDECE8]">{cleanVatNote}</p>
          ) : null}
        </RevealOnScroll>
      </div>
    </section>
  );
}
