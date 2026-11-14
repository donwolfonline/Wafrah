import type { AppLocale } from "@/i18n/request";
import { getFounderEmail, getSiteBaseUrl } from "./landing-config";

export interface LandingJsonLdInput {
  locale: AppLocale;
  brandName: string;
  description: string;
  pricingTiers: ReadonlyArray<{
    id: string;
    name: string;
    price: string;
    summary: string;
  }>;
  faqItems: ReadonlyArray<{
    id: string;
    question: string;
    answer: string;
  }>;
}

function normalizeNumericPrice(priceText: string): string {
  return priceText.replace(/[^0-9.]/g, "") || "0";
}

export function buildLandingJsonLd(input: LandingJsonLdInput) {
  const baseUrl = getSiteBaseUrl().toString().replace(/\/+$/, "");
  const pageUrl = `${baseUrl}${input.locale === "en" ? "/en" : "/"}`;
  const ogImageUrl = `${baseUrl}${input.locale === "en" ? "/og-en.png" : "/og-ar.png"}`;
  const orgId = `${baseUrl}/#organization`;
  const founderEmail = getFounderEmail();
  const isEn = input.locale === "en";

  const organization: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": orgId,
    name: input.brandName,
    url: baseUrl,
    logo: `${baseUrl}/icon-512.png`,
    areaServed: [
      { "@type": "City", name: isEn ? "Makkah" : "مكة المكرمة" },
      { "@type": "City", name: isEn ? "Jeddah" : "جدة" },
      {
        "@type": "Country",
        name: isEn ? "Saudi Arabia" : "المملكة العربية السعودية",
      },
    ],
  };

  if (founderEmail) {
    organization.contactPoint = {
      "@type": "ContactPoint",
      contactType: "sales",
      email: founderEmail,
      availableLanguage: ["Arabic", "English"],
    };
  }

  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: input.brandName,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    inLanguage: isEn ? "en" : "ar-SA",
    url: pageUrl,
    description: input.description,
    image: ogImageUrl,
    publisher: { "@id": orgId },
    offers: input.pricingTiers.map((tier) => ({
      "@type": "Offer",
      name: tier.name,
      description: tier.summary,
      price: normalizeNumericPrice(tier.price),
      priceCurrency: "SAR",
      availability: "https://schema.org/InStock",
      url: `${pageUrl}#pricing`,
    })),
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: isEn ? "en" : "ar-SA",
    mainEntity: input.faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return [organization, softwareApplication, faqPage] as const;
}

export function serializeJsonLd(payload: unknown): string {
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}
