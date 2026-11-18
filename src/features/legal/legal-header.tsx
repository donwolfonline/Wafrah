import Link from "next/link";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { BrandLogo } from "@/components/ui/brand-logo";
import { DirectionalArrowIcon } from "@/features/landing/landing-icons";
import { PilotCtaLink } from "@/features/landing/pilot-cta-link";
import type { AppLocale } from "@/i18n/request";
import { cn } from "@/lib/utils";
import type { LegalDocumentNamespace } from "./legal-sections";

interface LegalHeaderProps {
  locale: AppLocale;
  namespace: LegalDocumentNamespace;
  homeHref: string;
  brandWordmark: string;
  pilotTag: string;
  navLabel: string;
  navHomeLabel: string;
  privacyLabel: string;
  termsLabel: string;
  helpLabel: string;
  authHref: string;
  authLabel: string;
  shortCtaLabel: string;
  requestPilotLabel: string;
}

export function LegalHeader({
  locale,
  namespace,
  homeHref,
  brandWordmark,
  pilotTag,
  navLabel,
  navHomeLabel,
  privacyLabel,
  termsLabel,
  helpLabel,
  authHref,
  authLabel,
  shortCtaLabel,
  requestPilotLabel,
}: LegalHeaderProps) {
  const navItems: ReadonlyArray<{
    href: string;
    label: string;
    active?: boolean;
  }> = [
    { href: homeHref, label: navHomeLabel },
    { href: "/privacy", label: privacyLabel, active: namespace === "privacy" },
    { href: "/terms", label: termsLabel, active: namespace === "terms" },
    { href: "/help", label: helpLabel },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/15 bg-brand-dark-teal/95 text-white backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between gap-1.5 px-3 sm:gap-4 sm:px-6">
        <Link
          href={homeHref}
          className="min-w-0 shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
        >
          <BrandLogo
            wordmark={brandWordmark}
            subtitle={pilotTag}
            variant="onDark"
          />
        </Link>

        <nav
          aria-label={navLabel}
          className="hidden items-center gap-5 text-sm font-medium text-[#E4F2EE] lg:flex"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "rounded px-1.5 py-1 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold",
                item.active &&
                  "font-semibold text-white underline decoration-brand-gold decoration-2 underline-offset-8",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-3">
          <LanguageSwitcher className="rounded-md border-white/25 bg-white/10 px-2 text-xs font-medium text-white shadow-none hover:bg-white/20 hover:text-white sm:px-3 sm:text-sm [&_svg]:hidden min-[360px]:[&_svg]:inline-block [&_svg]:text-brand-gold" />

          <Link
            href={authHref}
            className="hidden min-h-9 items-center rounded-md px-2.5 text-sm font-medium text-[#E4F2EE] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold sm:inline-flex"
          >
            {authLabel}
          </Link>

          <PilotCtaLink
            href={`${homeHref}#join`}
            locale={locale}
            location="header"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-brand-gold px-2.5 py-2 text-xs font-semibold text-brand-text shadow-xs transition-colors hover:bg-[#d8b136] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:min-h-10 sm:px-4 sm:text-sm"
          >
            <span className="sm:hidden">{shortCtaLabel}</span>
            <span className="hidden sm:inline">{requestPilotLabel}</span>
            <DirectionalArrowIcon className="hidden sm:block" />
          </PilotCtaLink>
        </div>
      </div>
    </header>
  );
}
