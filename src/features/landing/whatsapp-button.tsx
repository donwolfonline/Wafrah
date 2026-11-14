"use client";

import type { ReactNode } from "react";
import type { AppLocale } from "@/i18n/request";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { getWhatsAppHref } from "./landing-config";
import { WhatsAppIcon } from "./landing-icons";

export type WhatsAppLocation =
  | "hero"
  | "sticky_bar"
  | "final_cta"
  | "form_success"
  | "footer";

export type WhatsAppVariant = "hero" | "sticky" | "finalCta" | "footer";

interface WhatsAppButtonProps {
  label: string;
  prefilledMessage: string;
  locale: AppLocale;
  location: WhatsAppLocation;
  variant: WhatsAppVariant;
  whatsappNumber?: string;
  className?: string;
  children?: ReactNode;
}

const VARIANT_CLASSES: Record<WhatsAppVariant, string> = {
  hero: "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/40 bg-brand-mid-teal px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-[#13806F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold",
  sticky:
    "inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-dark-teal px-3 py-2 text-center text-sm font-semibold leading-tight text-white shadow-xs transition-colors hover:bg-brand-mid-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold",
  finalCta:
    "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-dark-teal px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-mid-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-mid-teal",
  footer:
    "inline-flex items-center gap-2 rounded py-0.5 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold",
};

export function WhatsAppButton({
  label,
  prefilledMessage,
  locale,
  location,
  variant,
  whatsappNumber,
  className,
  children,
}: WhatsAppButtonProps) {
  const href = getWhatsAppHref(whatsappNumber, prefilledMessage);
  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("whatsapp_click", { locale, location })}
      className={cn(VARIANT_CLASSES[variant], className)}
    >
      <WhatsAppIcon className={variant === "sticky" ? "size-4 shrink-0" : undefined} />
      <span>{children ?? label}</span>
    </a>
  );
}
