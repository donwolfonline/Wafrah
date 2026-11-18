"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LegalSection } from "./legal-sections";

interface LegalTocCardProps {
  tocLabel: string;
  tocTitle: string;
  sectionCountLabel: string;
  sections: ReadonlyArray<Pick<LegalSection, "id" | "number" | "headingText">>;
}

/**
 * Collapsible table of contents on compact mobile/WebView viewports,
 * always expanded as a sticky sidebar on desktop (`lg+`).
 */
export function LegalTocCard({
  tocLabel,
  tocTitle,
  sectionCountLabel,
  sections,
}: LegalTocCardProps) {
  const [openMobile, setOpenMobile] = useState(false);

  return (
    <nav
      aria-label={tocLabel}
      className="min-w-0 rounded-2xl border border-border bg-white p-4 text-start shadow-xs sm:p-5"
    >
      <div className="flex items-center justify-between gap-2 lg:border-b lg:border-border lg:pb-3">
        <button
          type="button"
          aria-expanded={openMobile}
          onClick={() => setOpenMobile((prev) => !prev)}
          className="flex min-h-9 w-full items-center justify-between gap-2 text-start lg:hidden"
        >
          <span className="text-sm font-bold text-brand-dark-teal">
            {tocTitle}
          </span>
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-brand-light-tint px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-mid-teal ring-1 ring-border">
              {sectionCountLabel}
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-brand-mid-teal transition-transform",
                openMobile && "rotate-180",
              )}
            />
          </span>
        </button>

        <h2 className="hidden text-sm font-bold text-brand-dark-teal lg:block">
          {tocTitle}
        </h2>
        <span className="hidden rounded-full bg-brand-light-tint px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-mid-teal ring-1 ring-border lg:inline-flex">
          {sectionCountLabel}
        </span>
      </div>

      <ol
        className={cn(
          "mt-3 space-y-1 border-t border-border pt-3 lg:mt-3 lg:block lg:border-t-0 lg:pt-0",
          openMobile ? "block" : "hidden",
        )}
      >
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={() => setOpenMobile(false)}
              className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm leading-snug text-brand-text transition-colors hover:bg-brand-light-tint hover:text-brand-dark-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-mid-teal"
            >
              <span className="shrink-0 font-semibold tabular-nums text-brand-mid-teal">
                {section.number}.
              </span>
              <span>{section.headingText}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
