import type { AppLocale } from "@/i18n/request";
import { DirectionalArrowIcon } from "./landing-icons";
import { PilotCtaLink } from "./pilot-cta-link";
import { WhatsAppButton } from "./whatsapp-button";

interface MobileStickyCtaProps {
  locale: AppLocale;
  ariaLabel: string;
  primaryCta: string;
  secondaryCta: string;
  whatsappPrefilledMessage: string;
}

export function MobileStickyCta({
  locale,
  ariaLabel,
  primaryCta,
  secondaryCta,
  whatsappPrefilledMessage,
}: MobileStickyCtaProps) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur-sm sm:hidden"
    >
      <div className="mx-auto flex max-w-[1100px] items-center gap-2.5">
        <PilotCtaLink
          locale={locale}
          location="sticky_bar"
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-gold px-3 py-2 text-center text-sm font-bold leading-tight text-brand-text shadow-xs transition-colors hover:bg-[#d8b136] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark-teal"
        >
          <span>{primaryCta}</span>
          <DirectionalArrowIcon className="size-4" />
        </PilotCtaLink>

        <WhatsAppButton
          locale={locale}
          location="sticky_bar"
          variant="sticky"
          label={secondaryCta}
          prefilledMessage={whatsappPrefilledMessage}
        />
      </div>
    </div>
  );
}
