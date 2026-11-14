"use client";

import type { ReactNode } from "react";
import type { AppLocale } from "@/i18n/request";
import { track } from "@/lib/analytics";

export type PilotCtaLocation =
  | "header"
  | "hero"
  | "calculator"
  | "pricing"
  | "sticky_bar";

interface PilotCtaLinkProps {
  href?: string;
  locale: AppLocale;
  location: PilotCtaLocation;
  className: string;
  children: ReactNode;
}

export function PilotCtaLink({
  href = "#join",
  locale,
  location,
  className,
  children,
}: PilotCtaLinkProps) {
  return (
    <a
      href={href}
      onClick={() =>
        track("cta_click", {
          locale,
          location,
          target: "pilot_form",
        })
      }
      className={className}
    >
      {children}
    </a>
  );
}
