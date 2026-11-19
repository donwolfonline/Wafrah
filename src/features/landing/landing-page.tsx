import { I18nProvider } from "@/i18n/provider";
import {
  getAppMessages,
  getAppTranslations,
  pickRootClientMessages,
  type AppLocale,
} from "@/i18n/request";
import { Faq } from "./faq";
import { Features } from "./features";
import { FinalCta } from "./final-cta";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { buildLandingViewCopy } from "./landing-copy";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";
import { buildLandingJsonLd, serializeJsonLd } from "./landing-jsonld";
import { MobileStickyCta } from "./mobile-sticky-cta";
import { PilotPricing } from "./pilot-pricing";
import { ProblemStats } from "./problem-stats";
import { getPublicChromeContext } from "./public-page-context";
import { SavingsCalculator } from "./savings-calculator";

interface LandingPageProps {
  locale: AppLocale;
}

export async function LandingPage({ locale }: LandingPageProps) {
  const [t, tApp, messages] = await Promise.all([
    getAppTranslations("landing", locale),
    getAppTranslations("app", locale),
    getAppMessages(locale),
  ]);

  const whatsappPrefilledMessage = t("whatsapp.prefilledMessage");
  const { workspaceHref, currentYear, founderEmail, hasWhatsApp } =
    await getPublicChromeContext(locale, whatsappPrefilledMessage);
  const view = buildLandingViewCopy(
    (key, values) => t(key as Parameters<typeof t>[0], values),
    tApp("logoText"),
  );
  const jsonLdEntries = buildLandingJsonLd({
    locale,
    brandName: t("header.brandName"),
    description: t("meta.description"),
    pricingTiers: view.pricingTiers,
    faqItems: view.faqItems,
  });

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-brand-gold focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-brand-text focus:shadow-lg"
      >
        {t("header.skipToContent")}
      </a>

      <LandingHeader
        locale={locale}
        brandWordmark={view.brandWordmark}
        pilotTag={t("header.pilotTag")}
        switchLabel={t("header.switchLanguage")}
        switchAriaLabel={t("header.switchLanguageLabel")}
        signInLabel={t("header.signIn")}
        workspaceLabel={t("header.goToWorkspace")}
        primaryCtaLabel={t("header.requestPilot")}
        shortCtaLabel={t("header.shortCta")}
        navLabel={t("header.navLabel")}
        openMenuLabel={t("header.openMenu")}
        closeMenuLabel={t("header.closeMenu")}
        navItems={view.navItems}
        workspaceHref={workspaceHref}
      />

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <Hero
          locale={locale}
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          primaryCta={t("hero.primaryCta")}
          secondaryCta={t("hero.secondaryCta")}
          note={t("hero.note")}
          whatsappPrefilledMessage={whatsappPrefilledMessage}
          mock={view.mock}
        />

        <ProblemStats
          locale={locale}
          heading={t("problem.heading")}
          stat1={{
            figure: t("problem.stat1.figure"),
            description: t("problem.stat1.description"),
            sourceRef: t("problem.stat1.sourceRef"),
          }}
          stat2={{
            figure: t("problem.stat2.figure"),
            description: t("problem.stat2.description"),
            sourceRef: t("problem.stat2.sourceRef"),
          }}
          calloutText={t("problem.callout.text")}
          sourcesHeading={t("sources.heading")}
          placeholderNotice={t("sources.placeholderNotice")}
          referenceLabels={{
            ref1: t("sources.referenceLabel", { number: 1 }),
            ref2: t("sources.referenceLabel", { number: 2 }),
          }}
          pendingBadge={t("sources.pendingVerificationBadge")}
          openSourceLabel={t("sources.openSourceLink")}
        />

        <HowItWorks
          heading={t("howItWorks.heading")}
          subheading={t("howItWorks.subheading")}
          steps={view.steps}
        />

        <Features
          heading={t("features.heading")}
          subheading={t("features.subheading")}
          cards={view.featureCards}
        />

        <SavingsCalculator locale={locale} copy={view.calculator} />

        <PilotPricing
          locale={locale}
          heading={t("pricing.heading")}
          subheading={t("pricing.subheading")}
          pilotOfferBadge={t("pricing.pilotOfferBadge")}
          pilotOfferNote={t("pricing.pilotOfferNote")}
          periodLabel={t("pricing.periodLabel")}
          vatNote={t("pricing.vatNote")}
          ctaLabel={t("pricing.cta")}
          tiers={view.pricingTiers}
        />

        <Faq heading={t("faq.heading")} items={view.faqItems} />

        <I18nProvider
          locale={locale}
          messages={pickRootClientMessages(messages, true)}
        >
          <FinalCta
            locale={locale}
            badge={t("finalCta.badge")}
            heading={t("leadForm.heading")}
            subheading={t("leadForm.subheading")}
            highlights={[
              t("finalCta.highlight1"),
              t("finalCta.highlight2"),
              t("finalCta.highlight3"),
            ]}
            whatsappCtaLabel={t("hero.secondaryCta")}
            whatsappPrefilledMessage={whatsappPrefilledMessage}
          />
        </I18nProvider>
      </main>

      <LandingFooter
        locale={locale}
        brandWordmark={view.brandWordmark}
        tagline={t("footer.tagline")}
        pilotRegions={t("footer.pilotRegions")}
        linksTitle={t("footer.linksTitle")}
        contactTitle={t("footer.contactTitle")}
        privacyLabel={t("footer.privacy")}
        termsLabel={t("footer.terms")}
        helpLabel={t("footer.help")}
        signInLabel={t("footer.signIn")}
        workspaceLabel={t("header.goToWorkspace")}
        workspaceHref={workspaceHref}
        whatsappLabel={t("footer.whatsapp")}
        whatsappPrefilledMessage={whatsappPrefilledMessage}
        hasWhatsApp={hasWhatsApp}
        emailLabel={t("footer.emailLabel")}
        founderEmail={founderEmail}
        copyright={t("footer.copyright", { year: currentYear })}
      />

      <MobileStickyCta
        locale={locale}
        ariaLabel={t("stickyBar.ariaLabel")}
        primaryCta={t("header.shortCta")}
        secondaryCta={t("hero.secondaryCta")}
        whatsappPrefilledMessage={whatsappPrefilledMessage}
      />

      {jsonLdEntries.map((entry, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(entry) }}
        />
      ))}
    </div>
  );
}
