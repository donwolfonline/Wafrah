import { env } from "@/env";

export interface SupportContactConfig {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappUrl: string | null;
}

function readSafeHttpsUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function getSupportContactConfig(): SupportContactConfig {
  return {
    contactName: env.SUPPORT_CONTACT_NAME?.trim() || null,
    contactEmail: env.SUPPORT_CONTACT_EMAIL?.trim() || null,
    contactPhone: env.SUPPORT_CONTACT_PHONE?.trim() || null,
    whatsappUrl: readSafeHttpsUrl(env.SUPPORT_WHATSAPP_URL),
  };
}
