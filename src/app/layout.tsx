import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import type { ReactNode } from "react";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getAppTranslations("app");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
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
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
