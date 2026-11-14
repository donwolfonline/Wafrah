import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import { getPublicSiteBaseUrl } from "@/lib/app-url";
import type { ReactNode } from "react";
import "@/env";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { I18nProvider } from "@/i18n/provider";
import {
  getAppLocale,
  getAppMessages,
  getAppTranslations,
  getPublicRequestLocale,
  pickRootClientMessages,
} from "@/i18n/request";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0B4F45",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getAppTranslations("app");
  return {
    metadataBase: getPublicSiteBaseUrl(),
    title: t("metaTitle"),
    description: t("metaDescription"),
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: t("logoText"),
      statusBarStyle: "default",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const publicLocale = await getPublicRequestLocale();
  const locale = publicLocale ?? (await getAppLocale());
  const messages = await getAppMessages(locale);
  const rootMessages = pickRootClientMessages(messages, false);
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${inter.variable} ${ibmPlexSansArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <I18nProvider locale={locale} messages={rootMessages}>
          <ServiceWorkerRegistrar />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
