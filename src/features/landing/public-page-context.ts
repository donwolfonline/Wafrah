import { getServerSessionUser } from "@/features/auth/session";
import type { AppLocale } from "@/i18n/request";
import { getRoleHomePath } from "@/lib/authz-rules";
import { getFounderEmail, getWhatsAppHref } from "./landing-config";

export interface PublicChromeContext {
  workspaceHref: string | null;
  currentYear: number;
  founderEmail: string | null;
  hasWhatsApp: boolean;
}

/**
 * Resolves the signed-in user's home route if a valid session exists.
 * Never throws so public landing and legal pages render cleanly for guests.
 */
export async function resolveWorkspaceHref(): Promise<string | null> {
  try {
    const user = await getServerSessionUser();
    if (!user) {
      return null;
    }
    return getRoleHomePath(user.role);
  } catch {
    return null;
  }
}

/** Current calendar year in Asia/Riyadh for public footer copyright notices. */
export function getRiyadhYear(): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
  }).format(new Date());
  return Number(formatted);
}

/**
 * Shared public-page chrome context (session workspace CTA, footer contact info,
 * and Riyadh copyright year) reused across the landing and legal pages.
 */
export async function getPublicChromeContext(
  _locale: AppLocale,
  whatsappPrefilledMessage: string,
): Promise<PublicChromeContext> {
  const workspaceHref = await resolveWorkspaceHref();
  return {
    workspaceHref,
    currentYear: getRiyadhYear(),
    founderEmail: getFounderEmail(),
    hasWhatsApp: getWhatsAppHref(undefined, whatsappPrefilledMessage) !== null,
  };
}
