import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import {
  attachRuntimeErrorGuard,
  signInAdmin,
  signInManager,
  signInStaffPin,
} from "./qa-helpers";

const LOCALES = [
  { locale: "ar", path: "/", expectedDir: "rtl", ogImage: "/og-ar.png" },
  { locale: "en", path: "/en", expectedDir: "ltr", ogImage: "/og-en.png" },
] as const;

async function readJsonLdTypes(page: Page) {
  return page.evaluate(() => {
    const scripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
    );
    return scripts.map((el) => JSON.parse(el.textContent ?? "{}"));
  });
}

test.describe("Landing Launch Readiness (SEO, A11y, Interactive Flows)", () => {
  for (const cfg of LOCALES) {
    test(`[${cfg.locale}] SEO metadata, JSON-LD, OG image & zero Axe violations`, async ({
      page,
      request,
    }) => {
      const runtimeErrors = attachRuntimeErrorGuard(page);
      await page.setViewportSize({ width: 375, height: 812 });
      const res = await page.goto(cfg.path, { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);

      await expect(page.locator("html")).toHaveAttribute("dir", cfg.expectedDir);
      await expect(page).toHaveTitle(/.+/);
      await expect(
        page.locator('header svg[data-brand-mark="wafrah"]'),
      ).toBeVisible();

      const description = await page
        .locator('meta[name="description"]')
        .getAttribute("content");
      expect(description?.trim().length).toBeGreaterThan(20);

      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute("href");
      expect(canonical).toBeTruthy();
      expect(new URL(canonical!).pathname).toBe(cfg.path);

      const hreflangAr = await page
        .locator('link[rel="alternate"][hreflang="ar-SA"]')
        .getAttribute("href");
      const hreflangEn = await page
        .locator('link[rel="alternate"][hreflang="en"]')
        .getAttribute("href");
      const hreflangDefault = await page
        .locator('link[rel="alternate"][hreflang="x-default"]')
        .getAttribute("href");
      expect(new URL(hreflangAr!).pathname).toBe("/");
      expect(new URL(hreflangEn!).pathname).toBe("/en");
      expect(new URL(hreflangDefault!).pathname).toBe("/");

      const ogImage = await page
        .locator('meta[property="og:image"]')
        .getAttribute("content");
      expect(ogImage).toContain(cfg.ogImage);
      const twitterCard = await page
        .locator('meta[name="twitter:card"]')
        .getAttribute("content");
      expect(twitterCard).toBe("summary_large_image");

      const ogRes = await request.get(cfg.ogImage);
      expect(ogRes.status()).toBe(200);
      expect(ogRes.headers()["content-type"]).toContain("image/png");
      expect((await ogRes.body()).byteLength).toBeGreaterThan(50_000);

      const jsonLd = await readJsonLdTypes(page);
      const types = jsonLd.map((entry: Record<string, unknown>) => entry["@type"]);
      expect(types).toEqual(
        expect.arrayContaining(["Organization", "SoftwareApplication", "FAQPage"]),
      );
      const appSchema = jsonLd.find(
        (entry: Record<string, unknown>) => entry["@type"] === "SoftwareApplication",
      ) as Record<string, unknown>;
      expect(appSchema.aggregateRating).toBeUndefined();
      expect(appSchema.review).toBeUndefined();
      const faqSchema = jsonLd.find(
        (entry: Record<string, unknown>) => entry["@type"] === "FAQPage",
      ) as { mainEntity?: unknown[] };
      expect(faqSchema.mainEntity?.length).toBe(6);

      // Scroll through page so IntersectionObserver reveals below-the-fold sections before Axe contrast audit
      await page.waitForLoadState("networkidle");
      const docHeight = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      for (let y = 0; y <= docHeight; y += 600) {
        await page.evaluate((pos) => window.scrollTo(0, pos), y);
        await page.waitForTimeout(80);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);

      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);

      const headingLevels = await page.evaluate(() =>
        Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) =>
          Number(h.tagName.slice(1)),
        ),
      );
      expect(headingLevels.filter((lvl) => lvl === 1)).toHaveLength(1);
      for (let i = 1; i < headingLevels.length; i++) {
        expect(headingLevels[i]! - headingLevels[i - 1]!).toBeLessThanOrEqual(1);
      }

      expect(runtimeErrors).toEqual([]);
    });

    test(`[${cfg.locale}] Keyboard skip link, FAQ accordion, savings calculator & lead submit`, async ({
      page,
    }) => {
      const prisma = new PrismaClient();
      const uniqueDigits = String(Math.floor(1000000 + Math.random() * 8999999));
      const phoneInput = `055${uniqueDigits}`;
      const normalizedPhone = `+96655${uniqueDigits}`;

      try {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(cfg.path, { waitUntil: "networkidle" });
        const mountedAt = Date.now();

        // Skip-to-content keyboard check
        await page.keyboard.press("Tab");
        const skipHref = await page.evaluate(() =>
          document.activeElement?.getAttribute("href"),
        );
        expect(skipHref).toBe("#main-content");
        await page.keyboard.press("Enter");
        const mainId = await page.evaluate(() => document.activeElement?.id);
        expect(mainId).toBe("main-content");

        // FAQ keyboard check (second item starts collapsed; verify open + close by keyboard)
        const secondFaqButton = page.locator("#faq button[aria-expanded]").nth(1);
        await secondFaqButton.focus();
        await expect(secondFaqButton).toHaveAttribute("aria-expanded", "false");
        await page.keyboard.press("Enter");
        await expect(secondFaqButton).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Enter");
        await expect(secondFaqButton).toHaveAttribute("aria-expanded", "false");

        // Calculator keyboard check + live savings update
        const savingsOutput = page.getByTestId("calculator-monthly-savings");
        const beforeSavings = await savingsOutput.innerText();
        const purchasesSlider = page.locator('#calculator input[type="range"]').first();
        await purchasesSlider.focus();
        await page.keyboard.press("ArrowRight");
        await expect(savingsOutput).not.toHaveText(beforeSavings);

        // Invalid lead submit announces alert and moves focus to #lead-name
        const formSubmitBtn = page.locator('#pilot-form button[type="submit"]');
        await formSubmitBtn.click();
        await expect(page.locator("#lead-name-error")).toBeVisible();
        await expect(page.locator("#lead-name")).toBeFocused();

        // Fill valid lead and wait for anti-spam min 3s elapsed since mount
        await page.locator("#lead-name").fill("Faisal Alharbi");
        await page.locator("#lead-role").fill("General Manager");
        await page.locator("#lead-business").fill("Haramain Kitchen");
        await page.locator("#lead-phone").fill(phoneInput);
        await page.locator("#lead-consent").check();

        const elapsed = Date.now() - mountedAt;
        if (elapsed < 3200) {
          await page.waitForTimeout(3200 - elapsed);
        }

        await formSubmitBtn.click();
        const successCard = page.locator("#pilot-form-success");
        await expect(successCard).toBeVisible({ timeout: 10_000 });
        await expect(successCard).toBeFocused();
      } finally {
        await prisma.lead.deleteMany({ where: { phone: normalizedPhone } });
        await prisma.$disconnect();
      }
    });
  }

  test("robots.txt, sitemap.xml & noindex directives on app and legal placeholder routes", async ({
    browser,
    request,
  }) => {
    const robotsRes = await request.get("/robots.txt");
    expect(robotsRes.status()).toBe(200);
    const robotsText = await robotsRes.text();
    expect(robotsText).toContain("Disallow: /dashboard");
    expect(robotsText).toContain("Disallow: /log");
    expect(robotsText).toContain("Disallow: /admin");
    expect(robotsText).toContain("Disallow: /login");
    expect(robotsText).toContain("Sitemap:");

    const sitemapRes = await request.get("/sitemap.xml");
    expect(sitemapRes.status()).toBe(200);
    const sitemapXml = await sitemapRes.text();
    expect(sitemapXml).toContain("<loc>");
    expect(sitemapXml).toContain("/en</loc>");
    expect(sitemapXml).toContain("/help</loc>");
    expect(sitemapXml).toContain('hreflang="ar-SA"');
    expect(sitemapXml).toContain('hreflang="en"');
    expect(sitemapXml).toContain('hreflang="x-default"');

    const loginRes = await request.get("/login");
    expect(loginRes.headers()["x-robots-tag"]).toContain("noindex");
    const loginHtml = await loginRes.text();
    expect(loginHtml).toContain("noindex");
    expect(loginHtml).toContain('data-brand-mark="wafrah"');

    for (const placeholderPath of ["/privacy", "/terms"]) {
      const res = await request.get(placeholderPath);
      expect(res.status()).toBe(200);
      expect(await res.text()).toContain("noindex");
    }

    const loginCtx = await browser.newContext();
    const loginPage = await loginCtx.newPage();
    await loginPage.goto("/login");
    await expect(
      loginPage.locator('header svg[data-brand-mark="wafrah"]'),
    ).toBeVisible();
    await expect(
      loginPage.locator("header svg.lucide-utensils-crossed"),
    ).toHaveCount(0);
    await loginCtx.close();

    const mgrCtx = await browser.newContext();
    const mgrPage = await mgrCtx.newPage();
    await signInManager(mgrPage, "manager@shami.sa", "ShamiManager!2026");
    const dashRes = await mgrPage.goto("/dashboard");
    expect(dashRes?.headers()["x-robots-tag"]).toContain("noindex");
    expect(
      await mgrPage.locator('meta[name="robots"]').getAttribute("content"),
    ).toContain("noindex");
    await expect(
      mgrPage.locator('header svg[data-brand-mark="wafrah"]'),
    ).toBeVisible();
    await expect(
      mgrPage.locator("header svg.lucide-utensils-crossed"),
    ).toHaveCount(0);
    await mgrCtx.close();

    const staffCtx = await browser.newContext();
    const staffPage = await staffCtx.newPage();
    await signInStaffPin(staffPage, "SHAMI-JED", "ahmed", "1234");
    const logRes = await staffPage.goto("/log");
    expect(logRes?.headers()["x-robots-tag"]).toContain("noindex");
    expect(
      await staffPage.locator('meta[name="robots"]').getAttribute("content"),
    ).toContain("noindex");
    await expect(
      staffPage.locator('header svg[data-brand-mark="wafrah"]'),
    ).toBeVisible();
    await staffCtx.close();

    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signInAdmin(adminPage);
    const adminRes = await adminPage.goto("/admin");
    expect(adminRes?.headers()["x-robots-tag"]).toContain("noindex");
    expect(
      await adminPage.locator('meta[name="robots"]').getAttribute("content"),
    ).toContain("noindex");
    await expect(
      adminPage.locator('header svg[data-brand-mark="wafrah"]'),
    ).toBeVisible();
    await expect(
      adminPage.locator("header svg.lucide-utensils-crossed"),
    ).toHaveCount(0);
    await adminCtx.close();
  });
});
