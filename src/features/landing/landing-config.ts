export function getSiteBaseUrl(): URL {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000";
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export function getWhatsAppHref(
  rawNumber?: string,
  prefilledMessage?: string,
): string | null {
  const source = rawNumber ?? process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
  const digits = source.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  const baseUrl = `https://wa.me/${digits}`;
  const trimmedMessage = prefilledMessage?.trim() ?? "";
  if (!trimmedMessage) {
    return baseUrl;
  }

  return `${baseUrl}?text=${encodeURIComponent(trimmedMessage)}`;
}

export function isExternalHref(href: string | null): boolean {
  if (!href) {
    return false;
  }
  return href.startsWith("https://") || href.startsWith("http://");
}

export function getFounderEmail(rawEmail?: string): string | null {
  const value = (rawEmail ?? process.env.FOUNDER_EMAIL ?? "").trim();
  return value.length > 0 ? value : null;
}
