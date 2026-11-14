import { Badge } from "@/components/ui/badge";
import type { AppLocale } from "@/i18n/request";
import { CheckCircleIcon } from "./landing-icons";
import { PilotLeadFormLoader } from "./pilot-lead-form-loader";
import { RevealOnScroll } from "./reveal-on-scroll";

interface FinalCtaProps {
  locale: AppLocale;
  badge: string;
  heading: string;
  subheading: string;
  highlights: ReadonlyArray<string>;
  whatsappCtaLabel: string;
  whatsappPrefilledMessage: string;
}

export function FinalCta({
  locale,
  badge,
  heading,
  subheading,
  highlights,
  whatsappCtaLabel,
  whatsappPrefilledMessage,
}: FinalCtaProps) {
  return (
    <section
      id="join"
      className="scroll-mt-20 bg-brand-light-tint px-4 py-14 text-brand-text sm:px-6 sm:py-20"
    >
      <div className="mx-auto max-w-[1100px]">
        <RevealOnScroll>
          <div className="grid items-start gap-8 lg:grid-cols-12">
            <div className="space-y-5 text-start lg:col-span-6">
              <Badge variant="accent" className="px-3 py-1 text-xs font-bold">
                {badge}
              </Badge>

              <h2 className="text-2xl font-bold tracking-tight text-brand-dark-teal sm:text-3xl">
                {heading}
              </h2>

              <p className="text-base leading-relaxed text-brand-text">
                {subheading}
              </p>

              <ul className="space-y-3 pt-1 text-sm text-brand-text sm:text-base">
                {highlights.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <CheckCircleIcon className="mt-1 text-brand-mid-teal" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-6">
              <PilotLeadFormLoader
                locale={locale}
                whatsappCtaLabel={whatsappCtaLabel}
                whatsappPrefilledMessage={whatsappPrefilledMessage}
              />
            </div>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
