"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/i18n/request";
import { cn } from "@/lib/utils";
import { DirectionalArrowIcon } from "./landing-icons";
import { PilotCtaLink } from "./pilot-cta-link";

interface LandingMobileMenuProps {
  locale: AppLocale;
  pilotTag: string;
  navLabel: string;
  openMenuLabel: string;
  closeMenuLabel: string;
  authHref: string;
  authLabel: string;
  primaryCtaLabel: string;
  navItems: ReadonlyArray<{ href: string; label: string }>;
}

const DESKTOP_BREAKPOINT_QUERY = "(min-width: 1024px)";

export function LandingMobileMenu({
  locale,
  pilotTag,
  navLabel,
  openMenuLabel,
  closeMenuLabel,
  authHref,
  authLabel,
  primaryCtaLabel,
  navItems,
}: LandingMobileMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    const mediaQuery = window.matchMedia(DESKTOP_BREAKPOINT_QUERY);
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    mediaQuery.addEventListener("change", handleViewportChange);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      mediaQuery.removeEventListener("change", handleViewportChange);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        data-testid="landing-mobile-menu-trigger"
        aria-expanded={open}
        aria-controls="landing-mobile-menu"
        aria-label={open ? closeMenuLabel : openMenuLabel}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-md border text-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold",
          open
            ? "border-brand-gold/80 bg-white/20 shadow-xs"
            : "border-white/25 bg-white/10 hover:bg-white/20",
        )}
      >
        <span
          aria-hidden="true"
          className="relative flex size-4 flex-col items-center justify-center"
        >
          <span
            className={cn(
              "absolute h-0.5 w-4 rounded-full bg-current transition-transform duration-300 ease-out motion-reduce:transition-none",
              open ? "translate-y-0 rotate-45" : "-translate-y-1.5",
            )}
          />
          <span
            className={cn(
              "absolute h-0.5 w-4 rounded-full bg-current transition-all duration-200 ease-out motion-reduce:transition-none",
              open ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100",
            )}
          />
          <span
            className={cn(
              "absolute h-0.5 w-4 rounded-full bg-current transition-transform duration-300 ease-out motion-reduce:transition-none",
              open ? "translate-y-0 -rotate-45" : "translate-y-1.5",
            )}
          />
        </span>
      </button>

      {open ? (
        <>
          <div
            aria-hidden="true"
            data-testid="landing-mobile-menu-backdrop"
            onClick={closeMenu}
            className="landing-menu-backdrop absolute inset-x-0 top-full z-40 h-[calc(100dvh-4rem)] bg-[#062823]/55 backdrop-blur-[2px]"
          />

          <div
            id="landing-mobile-menu"
            data-testid="landing-mobile-menu-panel"
            className="landing-menu-panel absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-brand-gold/30 bg-brand-dark-teal shadow-[0_20px_48px_rgba(0,0,0,0.35)]"
          >
            <div className="mx-auto max-w-[1100px] space-y-3 px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5 sm:hidden">
                <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3 py-1 text-xs font-semibold text-[#F6E2A1]">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-brand-gold"
                  />
                  <span>{pilotTag}</span>
                </span>
              </div>

              <nav aria-label={navLabel} className="grid gap-1">
                {navItems.map((item, index) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={closeMenu}
                    style={{ animationDelay: `${index * 30}ms` }}
                    className="landing-menu-item flex min-h-11 items-center justify-between rounded-lg px-3.5 py-2.5 text-start text-base font-medium text-[#EAF5F2] transition-colors hover:bg-white/10 hover:text-white active:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                  >
                    <span>{item.label}</span>
                    <DirectionalArrowIcon className="size-4 text-brand-gold/80" />
                  </a>
                ))}
              </nav>

              <div
                style={{ animationDelay: `${navItems.length * 30}ms` }}
                className="landing-menu-item grid gap-2.5 border-t border-white/15 pt-3.5 sm:grid-cols-2"
              >
                <Link
                  href={authHref}
                  onClick={closeMenu}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                >
                  {authLabel}
                </Link>

                <PilotCtaLink
                  locale={locale}
                  location="header"
                  onClick={closeMenu}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-text shadow-xs transition-colors hover:bg-[#d8b136] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <span>{primaryCtaLabel}</span>
                  <DirectionalArrowIcon className="size-4" />
                </PilotCtaLink>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
