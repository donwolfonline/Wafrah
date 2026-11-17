import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { LandingFooter } from "../landing/landing-footer";
import { parseLegalSections, splitSectionHeading } from "./legal-sections";

type KeyedStrings = Record<string, string>;
type LegalMessages = {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: Record<
    string,
    { heading: string; paragraphs?: KeyedStrings; items?: KeyedStrings }
  >;
};

const namespaces = ["privacy", "terms"] as const;

function legal(
  messages: typeof en | typeof ar,
  namespace: (typeof namespaces)[number],
): LegalMessages {
  return messages[namespace] as unknown as LegalMessages;
}

function shape(doc: LegalMessages) {
  return Object.keys(doc.sections)
    .sort()
    .map((key) => [
      key,
      Object.keys(doc.sections[key].paragraphs ?? {}).length,
      Object.keys(doc.sections[key].items ?? {}).length,
    ]);
}

describe("privacy and terms content and helpers", () => {
  for (const namespace of namespaces) {
    it(`${namespace}: has real content in both locales with no legal placeholder`, () => {
      for (const messages of [en, ar]) {
        const doc = legal(messages, namespace);
        expect(doc.intro.length).toBeGreaterThan(50);
        expect(Object.keys(doc.sections).length).toBeGreaterThanOrEqual(10);
        expect(JSON.stringify(doc)).not.toContain("TO BE REPLACED");
        expect(JSON.stringify(doc)).not.toContain("PLACEHOLDER");
        for (const section of Object.values(doc.sections)) {
          const bodyCount =
            Object.keys(section.paragraphs ?? {}).length +
            Object.keys(section.items ?? {}).length;
          expect(section.heading.length).toBeGreaterThan(0);
          expect(bodyCount).toBeGreaterThan(0);
        }
      }
    });

    it(`${namespace}: English and Arabic have the same section structure`, () => {
      expect(shape(legal(ar, namespace))).toEqual(
        shape(legal(en, namespace)),
      );
    });

    it(`${namespace}: parses ordered sections cleanly for rendering`, () => {
      const parsedEn = parseLegalSections(en[namespace].sections);
      const parsedAr = parseLegalSections(ar[namespace].sections);
      expect(parsedEn.length).toBe(parsedAr.length);
      expect(parsedEn[0].id).toBe("section-s01");
      expect(parsedEn[0].number).toBe("1");
      expect(parsedEn[0].headingText).not.toMatch(/^1\./);
    });
  }

  it("splits optional numbered heading prefixes with safe fallback", () => {
    expect(splitSectionHeading("11. Governing law", 0)).toEqual({
      number: "11",
      headingText: "Governing law",
    });
    expect(splitSectionHeading("Overview", 2)).toEqual({
      number: "3",
      headingText: "Overview",
    });
  });

  it("renders matching LandingFooter with Wafrah brand mark", () => {
    const html = renderToStaticMarkup(
      LandingFooter({
        locale: "ar",
        brandWordmark: ar.app.logoText,
        tagline: ar.landing.footer.tagline,
        pilotRegions: ar.landing.footer.pilotRegions,
        linksTitle: ar.landing.footer.linksTitle,
        contactTitle: ar.landing.footer.contactTitle,
        privacyLabel: ar.landing.footer.privacy,
        termsLabel: ar.landing.footer.terms,
        helpLabel: ar.landing.footer.help,
        signInLabel: ar.landing.footer.signIn,
        workspaceLabel: ar.landing.header.goToWorkspace,
        workspaceHref: null,
        whatsappLabel: ar.landing.footer.whatsapp,
        whatsappPrefilledMessage: ar.landing.whatsapp.prefilledMessage,
        hasWhatsApp: false,
        emailLabel: ar.landing.footer.emailLabel,
        founderEmail: null,
        copyright: "© 2026 وفرة",
      }),
    );
    expect(html).toContain('data-brand-mark="wafrah"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });
});
