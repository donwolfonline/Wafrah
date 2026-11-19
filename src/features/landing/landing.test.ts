import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "@/components/ui/brand-logo";
import { LANDING_SOURCES } from "@/config/sources";
import {
  getFounderEmail,
  getWhatsAppHref,
  isExternalHref,
} from "@/features/landing/landing-config";
import { LandingMobileMenu } from "@/features/landing/landing-mobile-menu";
import { WhatsAppButton } from "@/features/landing/whatsapp-button";
import {
  evaluateMiddlewareDecision,
  getPublicRouteLocale,
} from "@/lib/authz-rules";
import { isAnalyticsEnabled, track } from "@/lib/analytics";

describe("landing route access and config helpers", () => {
  it("allows / and /en for unauthenticated and authenticated visitors while resolving path locales", () => {
    expect(getPublicRouteLocale("/")).toBe("ar");
    expect(getPublicRouteLocale("/en")).toBe("en");
    expect(getPublicRouteLocale("/dashboard")).toBeNull();
    expect(getPublicRouteLocale("/login")).toBeNull();

    for (const path of ["/", "/en"]) {
      expect(evaluateMiddlewareDecision(path, null)).toEqual({ type: "next" });
      expect(evaluateMiddlewareDecision(path, "STAFF")).toEqual({
        type: "next",
      });
      expect(evaluateMiddlewareDecision(path, "MANAGER")).toEqual({
        type: "next",
      });
      expect(evaluateMiddlewareDecision(path, "PLATFORM_ADMIN")).toEqual({
        type: "next",
      });
    }
  });

  it("formats WhatsApp links with encoded message and returns null when env value is missing", () => {
    expect(getWhatsAppHref("")).toBeNull();
    expect(getWhatsAppHref("   ", "Hello")).toBeNull();
    expect(isExternalHref(null)).toBe(false);
    expect(isExternalHref("#join")).toBe(false);

    expect(getWhatsAppHref("+966 50-123-4567")).toBe("https://wa.me/966501234567");
    expect(
      getWhatsAppHref(
        "+966 50-123-4567",
        "Hello, I'd like to know more about the Wafrah pilot for my restaurant.",
      ),
    ).toBe(
      "https://wa.me/966501234567?text=Hello%2C%20I'd%20like%20to%20know%20more%20about%20the%20Wafrah%20pilot%20for%20my%20restaurant.",
    );
    expect(isExternalHref("https://wa.me/966501234567")).toBe(true);
  });

  it("renders WhatsAppButton with localized prefilled message when configured and hides when empty", () => {
    const hiddenHtml = renderToStaticMarkup(
      WhatsAppButton({
        label: "Chat on WhatsApp",
        prefilledMessage: "Hello",
        locale: "en",
        location: "hero",
        variant: "hero",
        whatsappNumber: "",
      }),
    );
    expect(hiddenHtml).toBe("");

    const arHtml = renderToStaticMarkup(
      WhatsAppButton({
        label: "تواصل عبر واتساب",
        prefilledMessage: "مرحباً، أرغب بمعرفة المزيد عن تجربة وفرة لمطعمي",
        locale: "ar",
        location: "hero",
        variant: "hero",
        whatsappNumber: "+966 50-123-4567",
      }),
    );
    expect(arHtml).toContain("https://wa.me/966501234567?text=");
    expect(arHtml).toContain(
      encodeURIComponent("مرحباً، أرغب بمعرفة المزيد عن تجربة وفرة لمطعمي"),
    );
  });

  it("normalizes founder email cleanly", () => {
    expect(getFounderEmail("")).toBeNull();
    expect(getFounderEmail("  founder@wafrah.sa  ")).toBe("founder@wafrah.sa");
  });

  it("keeps lightweight analytics hook disabled cleanly when NEXT_PUBLIC_ANALYTICS_PROVIDER is unset", () => {
    expect(isAnalyticsEnabled("")).toBe(false);
    expect(isAnalyticsEnabled(undefined)).toBe(false);
    expect(isAnalyticsEnabled("plausible")).toBe(true);
    expect(() =>
      track("calculator_used", {
        locale: "en",
        purchasesBand: "40k_to_120k",
        reductionPct: 10,
      }),
    ).not.toThrow();
  });

  it("exposes placeholder sources without invented URLs", () => {
    expect(LANDING_SOURCES).toHaveLength(2);
    for (const source of LANDING_SOURCES) {
      expect(source.isPlaceholder).toBe(true);
      expect(source.url).toBeNull();
      expect(source.titleEn).toContain("TODO");
      expect(source.titleAr).toContain("TODO");
    }
  });

  it("renders matching BrandLogo SVG emblem for both landing dark and app light headers", () => {
    const landingHtml = renderToStaticMarkup(
      BrandLogo({
        wordmark: "Wafrah وفرة",
        subtitle: "برنامج تجريبي",
        variant: "onDark",
      }),
    );
    const appHtml = renderToStaticMarkup(
      BrandLogo({
        wordmark: "Wafrah وفرة",
        subtitle: "منصة ذكية للحد من الهدر الغذائي",
        variant: "onLight",
      }),
    );

    for (const html of [landingHtml, appHtml]) {
      expect(html).toContain('data-brand-mark="wafrah"');
      expect(html).toContain('stroke="#C9A227"');
      expect(html).toContain("M18 8.5C13.6 11.4");
      expect(html).toContain("Wafrah وفرة");
    }
    expect(landingHtml).toContain("#0E6B5C");
    expect(appHtml).toContain("#0B4F45");
    expect(appHtml).toContain("text-brand-dark-teal");
  });

  it("renders LandingMobileMenu trigger hidden on lg+ desktop and closed by default", () => {
    const html = renderToStaticMarkup(
      createElement(LandingMobileMenu, {
        locale: "ar",
        pilotTag: "تجربة الرياض",
        navLabel: "أقسام الصفحة",
        openMenuLabel: "فتح القائمة",
        closeMenuLabel: "إغلاق القائمة",
        authHref: "/login",
        authLabel: "تسجيل الدخول",
        primaryCtaLabel: "احجز مكانك في التجربة",
        navItems: [
          { href: "#problem", label: "المشكلة" },
          { href: "#pricing", label: "الأسعار" },
        ],
      }),
    );

    expect(html).toContain("lg:hidden");
    expect(html).toContain('data-testid="landing-mobile-menu-trigger"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="landing-mobile-menu"');
    expect(html).toContain('aria-label="فتح القائمة"');
    expect(html).not.toContain('data-testid="landing-mobile-menu-panel"');
  });
});
