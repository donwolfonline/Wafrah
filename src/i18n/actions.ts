"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getServerSessionUser } from "@/features/auth/session";
import { shouldUseSecureCookies } from "@/features/auth/session-policy";
import { getPlatformAdminDb, getTenantDb } from "@/lib/tenant";
import { type AppLocale, LOCALE_COOKIE_NAME } from "./request";

const setLocaleSchema = z.object({
  locale: z.enum(["ar", "en"]),
});

export async function setLocaleAction(
  rawInput: unknown,
): Promise<{ ok: boolean; locale?: AppLocale }> {
  const parsed = setLocaleSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false };
  }

  const { locale } = parsed.data;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
  });

  try {
    const sessionUser = await getServerSessionUser();
    if (sessionUser) {
      if (sessionUser.tenantId) {
        const tenantDb = await getTenantDb(sessionUser);
        await tenantDb.user.update({
          where: { id: sessionUser.userId },
          data: { locale },
        });
      } else if (sessionUser.role === "PLATFORM_ADMIN") {
        const adminDb = await getPlatformAdminDb(sessionUser);
        await adminDb.user.update({
          where: { id: sessionUser.userId },
          data: { locale },
        });
      }
    }
  } catch {
    // Cookie is already updated even if DB profile update fails
  }

  revalidatePath("/", "layout");
  return { ok: true, locale };
}
