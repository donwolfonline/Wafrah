import { cookies, headers } from "next/headers";
import { type AbstractIntlMessages, createTranslator } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { getServerSessionUser } from "@/features/auth/session";
import { PUBLIC_LOCALE_HEADER } from "@/lib/authz-rules";
import { getPlatformAdminDb, getTenantDb } from "@/lib/tenant";
import arMessages from "../../messages/ar.json";
import enMessages from "../../messages/en.json";

export type AppLocale = "ar" | "en";
export type AppMessages = typeof enMessages;

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
export const DEFAULT_LOCALE: AppLocale = "ar";

const MESSAGES_BY_LOCALE: Record<AppLocale, AppMessages> = {
  ar: arMessages,
  en: enMessages,
};

export function isSupportedLocale(value: unknown): value is AppLocale {
  return value === "ar" || value === "en";
}

export async function getPublicRequestLocale(): Promise<AppLocale | null> {
  try {
    const requestHeaders = await headers();
    const publicLocale = requestHeaders.get(PUBLIC_LOCALE_HEADER);
    if (isSupportedLocale(publicLocale)) {
      return publicLocale;
    }
  } catch {
    // headers() may be unavailable outside request context
  }
  return null;
}

export async function getAppLocale(): Promise<AppLocale> {
  try {
    const requestHeaders = await headers();
    const publicLocale = requestHeaders.get(PUBLIC_LOCALE_HEADER);
    if (isSupportedLocale(publicLocale)) {
      return publicLocale;
    }
  } catch {
    // headers() may be unavailable outside request context
  }

  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
    if (isSupportedLocale(cookieLocale)) {
      return cookieLocale;
    }
  } catch {
    // cookies() may be unavailable outside request context
  }

  try {
    const sessionUser = await getServerSessionUser();
    if (sessionUser) {
      if (sessionUser.tenantId) {
        const tenantDb = await getTenantDb(sessionUser);
        const dbUser = await tenantDb.user.findUnique({
          where: { id: sessionUser.userId },
          select: { locale: true },
        });
        if (isSupportedLocale(dbUser?.locale)) {
          return dbUser.locale;
        }
      } else if (sessionUser.role === "PLATFORM_ADMIN") {
        const adminDb = await getPlatformAdminDb(sessionUser);
        const dbUser = await adminDb.user.findUnique({
          where: { id: sessionUser.userId },
          select: { locale: true },
        });
        if (isSupportedLocale(dbUser?.locale)) {
          return dbUser.locale;
        }
      }

      if (isSupportedLocale(sessionUser.locale)) {
        return sessionUser.locale;
      }
    }
  } catch {
    // Session or DB unavailable during static generation
  }

  return DEFAULT_LOCALE;
}

export async function getAppMessages(locale?: AppLocale): Promise<AppMessages> {
  const resolved = locale ?? (await getAppLocale());
  return MESSAGES_BY_LOCALE[resolved] ?? arMessages;
}

export function pickRootClientMessages(
  messages: AppMessages,
  includeLandingForm: boolean,
): AbstractIntlMessages {
  if (includeLandingForm) {
    return {
      common: messages.common,
      landing: {
        leadForm: messages.landing.leadForm,
      },
    } as unknown as AbstractIntlMessages;
  }
  return {
    common: messages.common,
  } as unknown as AbstractIntlMessages;
}

export async function getAppTranslations<Namespace extends keyof AppMessages>(
  namespace: Namespace,
  explicitLocale?: AppLocale,
) {
  const locale = explicitLocale ?? (await getAppLocale());
  const messages = await getAppMessages(locale);
  return createTranslator({
    locale,
    messages,
    namespace,
    timeZone: "Asia/Riyadh",
  });
}

export default getRequestConfig(async () => {
  const locale = await getAppLocale();
  const messages = await getAppMessages(locale);

  return {
    locale,
    timeZone: "Asia/Riyadh",
    messages,
  };
});
