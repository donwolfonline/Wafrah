import Link from "next/link";
import type { AppLocale } from "@/i18n/request";
import { BrandLogo } from "@/components/ui/brand-logo";
import { DirectionalArrowIcon } from "./landing-icons";
import { PilotCtaLink } from "./pilot-cta-link";

interface LandingHeaderProps {
  locale: AppLocale;
  brandWordmark: string;
  pilotTag: string;
  switchLabel: string;
  switchAriaLabel: string;
  signInLabel: string;
  workspaceLabel: string;
  primaryCtaLabel: string;
  shortCtaLabel: string;
  navLabel: string;
  navItems: ReadonlyArray<{ href: string; label: string }>;
  workspaceHref: string | null;
}

export function LandingHeader({
  locale,
  brandWordmark,
  pilotTag,
  switchLabel,
  switchAriaLabel,
  signInLabel,
  workspaceLabel,
  primaryCtaLabel,
  shortCtaLabel,
  navLabel,
  navItems,
  workspaceHref,
}: LandingHeaderProps) {
  const homeHref = locale === "en" ? "/en" : "/";
  const switchHref = locale === "en" ? "/" : "/en";
  const authHref = workspaceHref ?? "/login";
  const authLabel = workspaceHref ? workspaceLabel : signInLabel;

  return (
    <header className="sticky top-0 z-40 border-b border-white/15 bg-brand-dark-teal/95 text-white backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <Link
          href={homeHref}
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
        >
          <BrandLogo wordmark={brandWordmark} subtitle={pilotTag} variant="onDark" />
        </Link>

        <nav
          aria-label={navLabel}
          className="hidden items-center gap-5 text-sm font-medium text-[#E4F2EE] lg:flex"
        >
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded px-1.5 py-1 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <a
            href={switchHref}
            aria-label={switchAriaLabel}
            hrefLang={locale === "en" ? "ar-SA" : "en"}
            className="inline-flex min-h-9 items-center rounded-md border border-white/25 bg-white/10 px-2.5 text-xs font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold sm:px-3 sm:text-sm"
          >
            {switchLabel}
          </a>

          <Link
            href={authHref}
            className="hidden min-h-9 items-center rounded-md px-2.5 text-sm font-medium text-[#E4F2EE] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold sm:inline-flex"
          >
            {authLabel}
          </Link>

          <PilotCtaLink
            locale={locale}
            location="header"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-brand-gold px-3 py-2 text-xs font-semibold text-brand-text shadow-xs transition-colors hover:bg-[#d8b136] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:min-h-10 sm:px-4 sm:text-sm"
          >
            <span className="sm:hidden">{shortCtaLabel}</span>
            <span className="hidden sm:inline">{primaryCtaLabel}</span>
            <DirectionalArrowIcon className="hidden sm:block" />
          </PilotCtaLink>
        </div>
      </div>
    </header>
  );
}
