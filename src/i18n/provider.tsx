"use client";

import { type AbstractIntlMessages, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type { AppLocale } from "./request";

interface I18nProviderProps {
  locale: AppLocale;
  messages: AbstractIntlMessages;
  children: ReactNode;
}

export function I18nProvider({
  locale,
  messages,
  children,
}: I18nProviderProps) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="Asia/Riyadh"
    >
      {children}
    </NextIntlClientProvider>
  );
}
