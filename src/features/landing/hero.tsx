import type { AppLocale } from "@/i18n/request";
import { DirectionalArrowIcon } from "./landing-icons";
import { HeroProductMock, type HeroMockCopy } from "./hero-product-mock";
import { PilotCtaLink } from "./pilot-cta-link";
import { WhatsAppButton } from "./whatsapp-button";

interface HeroProps {
  locale: AppLocale;
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCta: string;
  secondaryCta: string;
  note: string;
  whatsappPrefilledMessage: string;
  mock: HeroMockCopy;
}

export function Hero({
  locale,
  eyebrow,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
  note,
  whatsappPrefilledMessage,
  mock,
}: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-brand-dark-teal text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_end,rgba(201,162,39,0.14),transparent_48%),radial-gradient(circle_at_bottom_start,rgba(14,107,92,0.55),transparent_55%)]"
      />
      <div className="relative mx-auto grid max-w-[1100px] items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-12 lg:gap-8 lg:py-20">
        <div className="space-y-6 text-start lg:col-span-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-gold/60 bg-brand-mid-teal px-3.5 py-1.5 text-xs font-semibold text-white sm:text-sm">
            <span className="size-2 rounded-full bg-brand-gold" aria-hidden="true" />
            <span>{eyebrow}</span>
          </div>

          <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            {title}
          </h1>

          <p className="max-w-xl text-base leading-relaxed text-[#E4F2EE] sm:text-lg">
            {subtitle}
          </p>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center">
            <PilotCtaLink
              locale={locale}
              location="hero"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-gold px-6 py-3 text-base font-bold text-brand-text shadow-md transition-colors hover:bg-[#d8b136] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span>{primaryCta}</span>
              <DirectionalArrowIcon />
            </PilotCtaLink>

            <WhatsAppButton
              locale={locale}
              location="hero"
              variant="hero"
              label={secondaryCta}
              prefilledMessage={whatsappPrefilledMessage}
            />
          </div>

          <p className="text-sm font-medium text-[#DDECE8]">
            {note}
          </p>
        </div>

        <div className="lg:col-span-6">
          <HeroProductMock copy={mock} />
        </div>
      </div>
    </section>
  );
}
