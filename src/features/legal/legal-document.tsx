import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { LandingFooter } from "@/features/landing/landing-footer";
import { DirectionalArrowIcon } from "@/features/landing/landing-icons";
import { getPublicChromeContext } from "@/features/landing/public-page-context";
import {
  getAppLocale,
  getAppMessages,
  getAppTranslations,
} from "@/i18n/request";
import { LegalHeader } from "./legal-header";
import {
  type LegalDocumentNamespace,
  parseLegalSections,
} from "./legal-sections";
import { LegalTocCard } from "./legal-toc-card";

export async function LegalDocument({
  namespace,
}: {
  namespace: LegalDocumentNamespace;
}) {
  const locale = await getAppLocale();
  const [t, tLegal, tApp, tLanding, messages] = await Promise.all([
    getAppTranslations(namespace, locale),
    getAppTranslations("legalPage", locale),
    getAppTranslations("app", locale),
    getAppTranslations("landing", locale),
    getAppMessages(locale),
  ]);

  const whatsappPrefilledMessage = tLanding("whatsapp.prefilledMessage");
  const { workspaceHref, currentYear, founderEmail, hasWhatsApp } =
    await getPublicChromeContext(locale, whatsappPrefilledMessage);

  const sections = parseLegalSections(messages[namespace].sections);
  const homeHref = locale === "en" ? "/en" : "/";
  const authHref = workspaceHref ?? "/login";
  const authLabel = workspaceHref
    ? tLanding("header.goToWorkspace")
    : tLanding("header.signIn");
  const cardAuthLabel = workspaceHref ? authLabel : tLegal("backToLogin");
  const otherHref = namespace === "privacy" ? "/terms" : "/privacy";
  const otherLabel =
    namespace === "privacy" ? tLegal("viewTerms") : tLegal("viewPrivacy");

  return (
    <div className="flex min-h-dvh flex-col bg-brand-light-tint text-brand-text">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-brand-gold focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-brand-text focus:shadow-lg"
      >
        {tLanding("header.skipToContent")}
      </a>

      <LegalHeader
        locale={locale}
        namespace={namespace}
        homeHref={homeHref}
        brandWordmark={tApp("logoText")}
        pilotTag={tLanding("header.pilotTag")}
        navLabel={tLegal("navLabel")}
        navHomeLabel={tLegal("navHome")}
        privacyLabel={tLegal("viewPrivacy")}
        termsLabel={tLegal("viewTerms")}
        helpLabel={tLanding("footer.help")}
        authHref={authHref}
        authLabel={authLabel}
        shortCtaLabel={tLanding("header.shortCta")}
        requestPilotLabel={tLanding("header.requestPilot")}
      />

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <section className="relative overflow-hidden bg-brand-dark-teal text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_end,rgba(201,162,39,0.14),transparent_48%),radial-gradient(circle_at_bottom_start,rgba(14,107,92,0.55),transparent_55%)]"
          />
          <div className="relative mx-auto max-w-[1100px] space-y-5 px-4 py-10 text-start sm:px-6 sm:py-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-gold/60 bg-brand-mid-teal px-3.5 py-1.5 text-xs font-semibold text-white sm:text-sm">
              <span
                className="size-2 rounded-full bg-brand-gold"
                aria-hidden="true"
              />
              <span>{tLegal("eyebrow")}</span>
            </div>

            <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              {t("title")}
            </h1>

            <p className="max-w-3xl text-base leading-relaxed text-[#E4F2EE] sm:text-lg">
              {t("intro")}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-xs font-medium text-[#DDECE8]">
                {t("lastUpdated")}
              </span>
              <Link
                href={otherHref}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-gold/50 bg-brand-mid-teal/75 px-3.5 py-1 text-xs font-semibold text-[#F3CF5E] transition-colors hover:bg-brand-mid-teal hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
              >
                <span>{otherLabel}</span>
                <DirectionalArrowIcon className="size-3.5" />
              </Link>
            </div>
          </div>
        </section>

        <section className="px-3.5 py-8 sm:px-6 sm:py-14">
          <div className="mx-auto grid max-w-[1100px] gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
            <div className="min-w-0 lg:col-span-4 lg:col-start-1 lg:row-start-1">
              <LegalTocCard
                tocLabel={tLegal("tocLabel")}
                tocTitle={tLegal("tocTitle")}
                sectionCountLabel={tLegal("sectionCount", {
                  count: sections.length,
                })}
                sections={sections.map((s) => ({
                  id: s.id,
                  number: s.number,
                  headingText: s.headingText,
                }))}
              />
            </div>

            <div className="min-w-0 lg:col-span-8 lg:col-start-5 lg:row-span-2 lg:row-start-1">
              <Card className="min-w-0 overflow-hidden rounded-2xl border-border bg-white py-0 text-start shadow-xs">
                <div
                  aria-hidden="true"
                  className="h-1.5 w-full bg-gradient-to-r from-brand-dark-teal via-brand-gold to-brand-dark-teal"
                />
                <CardContent className="p-0" data-testid="legal-document">
                  <div className="divide-y divide-border">
                    {sections.map((section) => (
                      <section
                        key={section.id}
                        id={section.id}
                        className="scroll-mt-24 space-y-3.5 px-4 py-5 text-start sm:px-8 sm:py-7"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-dark-teal text-xs font-bold tabular-nums text-white ring-2 ring-brand-gold/60"
                          >
                            {section.number}
                          </span>
                          <h2 className="text-base font-bold leading-snug text-brand-dark-teal sm:text-xl">
                            <span className="sr-only">{section.number}. </span>
                            {section.headingText}
                          </h2>
                        </div>

                        {section.paragraphs.map((paragraph) => (
                          <p
                            key={paragraph}
                            className="text-sm leading-7 text-brand-text sm:text-base"
                          >
                            {paragraph}
                          </p>
                        ))}

                        {section.items.length > 0 ? (
                          <ul className="list-disc space-y-2.5 ps-5 text-sm leading-7 text-brand-text marker:text-brand-gold sm:ps-6 sm:text-base">
                            {section.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : null}
                      </section>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-brand-light-tint/55 px-4 py-4 text-sm sm:px-8">
                    <div className="flex flex-wrap items-center gap-4">
                      <Link
                        href={otherHref}
                        className="font-semibold text-brand-dark-teal hover:text-brand-mid-teal hover:underline"
                      >
                        {otherLabel}
                      </Link>
                      <Link
                        href={homeHref}
                        className="font-medium text-brand-mid-teal hover:underline"
                      >
                        {tLegal("backToHome")}
                      </Link>
                    </div>
                    <Link
                      href={authHref}
                      className="font-medium text-brand-mid-teal hover:underline"
                    >
                      {cardAuthLabel}
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="min-w-0 space-y-3 rounded-2xl border border-border bg-white p-5 text-start shadow-xs lg:col-span-4 lg:col-start-1 lg:row-start-2">
              <h2 className="text-sm font-bold text-brand-dark-teal">
                {tLegal("needHelpHeading")}
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {tLegal("needHelpBody")}
              </p>
              <Link
                href="/help"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-brand-mid-teal/30 bg-brand-light-tint px-3 py-1.5 text-xs font-semibold text-brand-dark-teal transition-colors hover:border-brand-mid-teal hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-mid-teal"
              >
                <span>{tLegal("contactHelp")}</span>
                <DirectionalArrowIcon className="size-3.5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter
        locale={locale}
        brandWordmark={tApp("logoText")}
        tagline={tLanding("footer.tagline")}
        pilotRegions={tLanding("footer.pilotRegions")}
        linksTitle={tLanding("footer.linksTitle")}
        contactTitle={tLanding("footer.contactTitle")}
        privacyLabel={tLanding("footer.privacy")}
        termsLabel={tLanding("footer.terms")}
        helpLabel={tLanding("footer.help")}
        signInLabel={tLanding("footer.signIn")}
        workspaceLabel={tLanding("header.goToWorkspace")}
        workspaceHref={workspaceHref}
        whatsappLabel={tLanding("footer.whatsapp")}
        whatsappPrefilledMessage={whatsappPrefilledMessage}
        hasWhatsApp={hasWhatsApp}
        emailLabel={tLanding("footer.emailLabel")}
        founderEmail={founderEmail}
        copyright={tLanding("footer.copyright", { year: currentYear })}
      />
    </div>
  );
}
