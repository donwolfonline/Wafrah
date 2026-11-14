import type { Metadata } from "next";
import { getAppTranslations, type AppLocale } from "@/i18n/request";
import { getSiteBaseUrl } from "./landing-config";

export async function buildLandingMetadata(
  locale: AppLocale,
): Promise<Metadata> {
  const t = await getAppTranslations("landing", locale);
  const title = t("meta.title");
  const description = t("meta.description");
  const ogImageAlt = t("meta.ogImageAlt");
  const siteName = t("header.brandName");
  const canonicalPath = locale === "en" ? "/en" : "/";
  const ogImagePath = locale === "en" ? "/og-en.png" : "/og-ar.png";

  return {
    metadataBase: getSiteBaseUrl(),
    title,
    description,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: canonicalPath,
      languages: {
        "ar-SA": "/",
        en: "/en",
        "x-default": "/",
      },
    },
    openGraph: {
      type: "website",
      siteName,
      locale: locale === "en" ? "en_US" : "ar_SA",
      alternateLocale: locale === "en" ? ["ar_SA"] : ["en_US"],
      url: canonicalPath,
      title,
      description,
      images: [
        {
          url: ogImagePath,
          width: 1200,
          height: 630,
          alt: ogImageAlt,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: ogImagePath,
          alt: ogImageAlt,
        },
      ],
    },
  };
}
