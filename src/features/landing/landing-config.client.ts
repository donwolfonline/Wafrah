import { clientEnv } from "@/env.client";

export function getWhatsAppHref(
  rawNumber?: string,
  prefilledMessage?: string,
): string | null {
  const source = rawNumber ?? clientEnv.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
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
