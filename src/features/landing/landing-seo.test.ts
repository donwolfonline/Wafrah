import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import arMessages from "../../../messages/ar.json";
import enMessages from "../../../messages/en.json";

vi.mock("@/features/auth/session", () => ({
  auth: vi.fn().mockResolvedValue(null),
  getServerSessionUser: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/i18n/request", () => ({
  getAppTranslations: vi.fn(
    async (namespace: string, locale: "ar" | "en" = "ar") => {
      const messages = (
        locale === "en" ? enMessages : arMessages
      ) as unknown as AbstractIntlMessages;
      return createTranslator({
        locale,
        messages,
        namespace: namespace as never,
      });
    },
  ),
}));

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { evaluateMiddlewareDecision } from "@/lib/authz-rules";
import {
  DISALLOWED_APP_PATH_PREFIXES,
  NOINDEX_METADATA,
  NOINDEX_PLACEHOLDER_METADATA,
} from "@/lib/seo";
import { buildLandingJsonLd, serializeJsonLd } from "./landing-jsonld";
import { buildLandingMetadata } from "./landing-metadata";

function collectLeafKeys(
  node: unknown,
  prefix = "",
): Array<{ key: string; value: string }> {
  if (typeof node === "string") {
    return [{ key: prefix, value: node }];
  }
  if (!node || typeof node !== "object") {
    return [];
  }
  const out: Array<{ key: string; value: string }> = [];
  for (const [k, v] of Object.entries(node)) {
    const next = prefix ? `${prefix}.${k}` : k;
    out.push(...collectLeafKeys(v, next));
  }
  return out;
}

describe("landing SEO, structured data & content QA", () => {
  it("allows crawler and OG static paths without auth redirect", () => {
    for (const pathname of [
      "/robots.txt",
      "/sitemap.xml",
      "/og-ar.png",
      "/og-en.png",
    ]) {
      const decision = evaluateMiddlewareDecision(pathname, null);
      expect(decision).toEqual({ type: "next" });
    }
  });

  it("disallows everything in robots.txt when VERCEL_ENV !== production and allows landing routes in production", () => {
    const previousVercelEnv = process.env.VERCEL_ENV;
    try {
      delete process.env.VERCEL_ENV;
      const devResult = robots();
      const devRules = Array.isArray(devResult.rules)
        ? devResult.rules
        : [devResult.rules];
      expect(devRules[0]?.disallow).toBe("/");
      expect(devRules[0]?.allow).toBeUndefined();
      expect(devResult.sitemap).toBeUndefined();

      process.env.VERCEL_ENV = "preview";
      const previewResult = robots();
      const previewRules = Array.isArray(previewResult.rules)
        ? previewResult.rules
        : [previewResult.rules];
      expect(previewRules[0]?.disallow).toBe("/");
      expect(previewRules[0]?.allow).toBeUndefined();
      expect(previewResult.sitemap).toBeUndefined();

      process.env.VERCEL_ENV = "production";
      const prodResult = robots();
      const prodRules = Array.isArray(prodResult.rules)
        ? prodResult.rules
        : [prodResult.rules];
      expect(prodRules[0]?.allow).toEqual(
        expect.arrayContaining([
          "/",
          "/en",
          "/help",
          "/og-ar.png",
          "/og-en.png",
        ]),
      );
      for (const prefix of DISALLOWED_APP_PATH_PREFIXES) {
        expect(prodRules[0]?.disallow).toContain(prefix);
      }
      expect(prodResult.sitemap).toMatch(/\/sitemap\.xml$/);
    } finally {
      if (previousVercelEnv === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousVercelEnv;
      }
    }
  });

  it("generates sitemap with ar, en, and x-default hreflang alternates", () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/en"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/help"))).toBe(true);
    const rootEntry = entries[0];
    expect(rootEntry?.alternates?.languages?.["ar-SA"]).toBeDefined();
    expect(rootEntry?.alternates?.languages?.en).toBeDefined();
    expect(rootEntry?.alternates?.languages?.["x-default"]).toBeDefined();
  });

  it("builds per-locale metadata with canonical, hreflang, and local PNG OG images", async () => {
    const arMeta = await buildLandingMetadata("ar");
    const enMeta = await buildLandingMetadata("en");

    expect(arMeta.alternates?.canonical).toBe("/");
    expect(enMeta.alternates?.canonical).toBe("/en");
    expect(arMeta.alternates?.languages).toEqual({
      "ar-SA": "/",
      en: "/en",
      "x-default": "/",
    });
    expect(arMeta.openGraph?.images).toEqual([
      expect.objectContaining({
        url: "/og-ar.png",
        width: 1200,
        height: 630,
        type: "image/png",
      }),
    ]);
    expect(enMeta.openGraph?.images).toEqual([
      expect.objectContaining({
        url: "/og-en.png",
        width: 1200,
        height: 630,
        type: "image/png",
      }),
    ]);
    expect(arMeta.twitter).toMatchObject({ card: "summary_large_image" });
    expect(enMeta.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("builds honest JSON-LD for Organization, SoftwareApplication, and FAQPage", () => {
    const faqEntries = Object.entries(enMessages.landing.faq)
      .filter(([key]) => /^q\d+$/.test(key))
      .map(([id, item]) => ({
        id,
        question: (item as { question: string }).question,
        answer: (item as { answer: string }).answer,
      }));

    const entries = buildLandingJsonLd({
      locale: "en",
      brandName: "Wafrah",
      description: enMessages.landing.meta.description,
      pricingTiers: [
        { id: "small", name: "Small", price: "400", summary: "Single branch" },
        { id: "medium", name: "Medium", price: "700", summary: "Pilot plan" },
        { id: "hotel", name: "Hotel", price: "1200", summary: "Multi-branch" },
      ],
      faqItems: faqEntries,
    });

    expect(entries).toHaveLength(3);
    const [org, app, faq] = entries;
    expect(org["@type"]).toBe("Organization");
    expect(app["@type"]).toBe("SoftwareApplication");
    expect(app).not.toHaveProperty("aggregateRating");
    expect(app).not.toHaveProperty("review");
    expect(app.offers).toHaveLength(3);
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity).toHaveLength(faqEntries.length);

    expect(serializeJsonLd({ text: "</script>" })).not.toContain("</script>");
  });

  it("exports noindex presets for app routes and placeholder pages", () => {
    expect(NOINDEX_METADATA.robots).toEqual({ index: false, follow: false });
    expect(NOINDEX_PLACEHOLDER_METADATA.robots).toEqual({
      index: false,
      follow: true,
    });
  });

  it("keeps AR and EN landing translation keys aligned and honest", () => {
    const arLeaves = collectLeafKeys(arMessages.landing);
    const enLeaves = collectLeafKeys(enMessages.landing);
    expect(arLeaves.map((x) => x.key)).toEqual(enLeaves.map((x) => x.key));

    for (const { key, value } of [...arLeaves, ...enLeaves]) {
      if (key === "pricing.vatNote") continue;
      expect(value.trim().length, `empty key ${key}`).toBeGreaterThan(0);
      expect(value, `TODO placeholder in ${key}`).not.toMatch(/\bTODO\b/i);
    }

    expect(arMessages.landing.hero.subtitle).toMatch(/تقديري|تقدير/);
    expect(enMessages.landing.hero.subtitle).toMatch(/estimated/i);
    expect(arMessages.landing.features.cards.monthlyReport.title).toMatch(
      /تقديري/,
    );
    expect(enMessages.landing.features.cards.monthlyReport.title).toMatch(
      /estimated/i,
    );
    expect(arMessages.landing.hero.mock.kpiDeltaValue).toContain(
      "\u2066-16%\u2069",
    );

    const publicDir = path.resolve(process.cwd(), "public");
    for (const file of ["og-ar.png", "og-en.png"]) {
      const fullPath = path.join(publicDir, file);
      expect(existsSync(fullPath)).toBe(true);
      expect(statSync(fullPath).size).toBeGreaterThan(50_000);
    }
  });
});
