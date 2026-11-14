export interface SupportContactConfig {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappUrl: string | null;
}

function readTrimmedEnv(key: string): string | null {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : null;
}

function readSafeHttpsUrl(key: string): string | null {
  const raw = readTrimmedEnv(key);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
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
    contactName: readTrimmedEnv("SUPPORT_CONTACT_NAME"),
    contactEmail: readTrimmedEnv("SUPPORT_CONTACT_EMAIL"),
    contactPhone: readTrimmedEnv("SUPPORT_CONTACT_PHONE"),
    whatsappUrl: readSafeHttpsUrl("SUPPORT_WHATSAPP_URL"),
  };
}
