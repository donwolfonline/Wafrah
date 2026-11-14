import Link from "next/link";
import type { AppLocale } from "@/i18n/request";
import { BrandLogo } from "@/components/ui/brand-logo";
import { WhatsAppButton } from "./whatsapp-button";

interface LandingFooterProps {
  locale: AppLocale;
  brandWordmark: string;
  tagline: string;
  pilotRegions: string;
  linksTitle: string;
  contactTitle: string;
  privacyLabel: string;
  termsLabel: string;
  helpLabel: string;
  signInLabel: string;
  workspaceLabel: string;
  workspaceHref: string | null;
  whatsappLabel: string;
  whatsappPrefilledMessage: string;
  hasWhatsApp: boolean;
  emailLabel: string;
  founderEmail: string | null;
  copyright: string;
}

export function LandingFooter({
  locale,
  brandWordmark,
  tagline,
  pilotRegions,
  linksTitle,
  contactTitle,
  privacyLabel,
  termsLabel,
  helpLabel,
  signInLabel,
  workspaceLabel,
  workspaceHref,
  whatsappLabel,
  whatsappPrefilledMessage,
  hasWhatsApp,
  emailLabel,
  founderEmail,
  copyright,
}: LandingFooterProps) {
  const homeHref = locale === "en" ? "/en" : "/";

  return (
    <footer className="bg-[#072621] px-4 pt-12 pb-24 text-white sm:px-6 sm:pb-12">
      <div className="mx-auto max-w-[1100px] space-y-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-12">
          <div className="space-y-3 text-start lg:col-span-5">
            <Link
              href={homeHref}
              className="inline-block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
            >
              <BrandLogo wordmark={brandWordmark} variant="onDark" />
            </Link>
            <p className="max-w-md text-sm leading-relaxed text-[#DCEAE6]">
              {tagline}
            </p>
            <p className="text-xs font-medium text-[#F3CF5E]">
              {pilotRegions}
            </p>
          </div>

          <div className="space-y-3 text-start lg:col-span-3">
            <h2 className="text-sm font-bold text-white">{linksTitle}</h2>
            <ul className="space-y-2 text-sm text-[#DCEAE6]">
              <li>
                <Link
                  href="/privacy"
                  className="inline-block rounded py-0.5 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                >
                  {privacyLabel}
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="inline-block rounded py-0.5 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                >
                  {termsLabel}
                </Link>
              </li>
              <li>
                <Link
                  href="/help"
                  className="inline-block rounded py-0.5 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                >
                  {helpLabel}
                </Link>
              </li>
              <li>
                <Link
                  href={workspaceHref ?? "/login"}
                  className="inline-block rounded py-0.5 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                >
                  {workspaceHref ? workspaceLabel : signInLabel}
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3 text-start lg:col-span-4">
            <h2 className="text-sm font-bold text-white">{contactTitle}</h2>
            <ul className="space-y-2.5 text-sm text-[#DCEAE6]">
              {hasWhatsApp ? (
                <li>
                  <WhatsAppButton
                    locale={locale}
                    location="footer"
                    variant="footer"
                    label={whatsappLabel}
                    prefilledMessage={whatsappPrefilledMessage}
                  />
                </li>
              ) : null}
              {founderEmail ? (
                <li>
                  <a
                    href={`mailto:${founderEmail}`}
                    className="inline-block rounded py-0.5 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                  >
                    {emailLabel}: <span dir="ltr">{founderEmail}</span>
                  </a>
                </li>
              ) : null}
              {!hasWhatsApp && !founderEmail ? (
                <li className="text-xs text-[#DCEAE6]">{pilotRegions}</li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/15 pt-6 text-start text-xs text-[#C7DDD7]">
          {copyright}
        </div>
      </div>
    </footer>
  );
}
