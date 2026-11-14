import { env } from "@/env";
import { getPublicSiteBaseUrl } from "@/lib/app-url";
export {
  getWhatsAppHref,
  isExternalHref,
} from "./landing-config.client";

export function getSiteBaseUrl(): URL {
  return getPublicSiteBaseUrl();
}

export function getFounderEmail(rawEmail?: string): string | null {
  const value = (rawEmail ?? env.FOUNDER_EMAIL ?? "").trim();
  return value.length > 0 ? value : null;
}
