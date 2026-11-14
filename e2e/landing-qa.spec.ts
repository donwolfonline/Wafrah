import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const SCREENSHOT_DIR = path.resolve(
  process.env.LANDING_SCREENSHOT_DIR ??
    "/Users/frederickdineen/.gemini/antigravity/brain/3b432a40-e115-425c-8b42-4a1b1dc72cd8/landing-screenshots",
);

const CASES = [
  { route: "/", locale: "ar", dir: "rtl", width: 375, height: 812 },
  { route: "/", locale: "ar", dir: "rtl", width: 768, height: 1024 },
  { route: "/", locale: "ar", dir: "rtl", width: 1280, height: 800 },
  { route: "/en", locale: "en", dir: "ltr", width: 375, height: 812 },
  { route: "/en", locale: "en", dir: "ltr", width: 768, height: 1024 },
  { route: "/en", locale: "en", dir: "ltr", width: 1280, height: 800 },
] as const;

test.describe("Landing page visual, RTL, accessibility, and responsive QA", () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  for (const c of CASES) {
    test(`renders ${c.route} (${c.locale}) cleanly at ${c.width}x${c.height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: c.width, height: c.height });
      await page.goto(c.route, { waitUntil: "networkidle" });

      const htmlAttrs = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
      }));
      expect(htmlAttrs).toEqual({ lang: c.locale, dir: c.dir });

      // Walk through the page so every scroll-triggered reveal settles visible
      const docHeight = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      for (let y = 0; y <= docHeight; y += 500) {
        await page.evaluate((pos) => window.scrollTo(0, pos), y);
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(300);

      // Verify footer clearance above mobile sticky bottom CTA bar at bottom scroll
      if (c.width === 375) {
        const footerOverlap = await page.evaluate(() => {
          const footer = document.querySelector("footer");
          const copyright = footer?.lastElementChild as HTMLElement | null;
          const sticky = document.querySelector(
            "div[role='region'][aria-label]",
          ) as HTMLElement | null;
          const allRegions = Array.from(
            document.querySelectorAll("div[role='region']"),
          ) as HTMLElement[];
          const bottomSticky = allRegions.find((el) =>
            window.getComputedStyle(el).position === "fixed",
          );
          if (!copyright || !bottomSticky) {
            return { checked: false, occluded: false };
          }
          const cRect = copyright.getBoundingClientRect();
          const sRect = bottomSticky.getBoundingClientRect();
          return {
            checked: Boolean(sticky),
            occluded: cRect.bottom > sRect.top,
            cBottom: cRect.bottom,
            sTop: sRect.top,
          };
        });
        expect(footerOverlap.occluded).toBe(false);
      }

      // Scroll back to top before taking top/full screenshots
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);

      // Horizontal overflow check
      const overflowInfo = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(
        overflowInfo.scrollWidth,
        `Horizontal overflow detected on ${c.route} @ ${c.width}px: ${JSON.stringify(overflowInfo)}`,
      ).toBeLessThanOrEqual(overflowInfo.innerWidth);

      // Header bounds and single-row check
      const headerIssues = await page.evaluate(() => {
        const header = document.querySelector("header");
        if (!header) return ["Missing header"];
        const issues: string[] = [];
        const hRect = header.getBoundingClientRect();
        if (hRect.height > 80) {
          issues.push(`Header wrapped tall (${hRect.height}px)`);
        }
        const links = Array.from(header.querySelectorAll("a"));
        for (const a of links) {
          const r = a.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.left < -1 || r.right > window.innerWidth + 1) {
            issues.push(`Header link out of bounds: ${a.textContent}`);
          }
        }
        return issues;
      });
      expect(headerIssues).toEqual([]);

      // Assert no section remains invisible after scrolling
      const hiddenSections = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll(".landing-reveal"),
        ) as HTMLElement[];
        return els
          .map((el, i) => ({
            i,
            opacity: window.getComputedStyle(el).opacity,
          }))
          .filter((item) => item.opacity === "0");
      });
      expect(hiddenSections).toEqual([]);

      // RTL logical border check on pull-quote
      const pullQuoteBorder = await page.evaluate(() => {
        const bq = document.querySelector("blockquote");
        if (!bq) return null;
        const s = window.getComputedStyle(bq);
        return {
          borderRightWidth: s.borderRightWidth,
          borderLeftWidth: s.borderLeftWidth,
        };
      });
      expect(pullQuoteBorder).not.toBeNull();
      if (c.dir === "rtl") {
        expect(pullQuoteBorder?.borderRightWidth).toBe("4px");
        expect(pullQuoteBorder?.borderLeftWidth).toBe("1px");
      } else {
        expect(pullQuoteBorder?.borderLeftWidth).toBe("4px");
        expect(pullQuoteBorder?.borderRightWidth).toBe("1px");
      }

      // Check axe-core WCAG 2.0 A & AA (including contrast)
      const axeResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const violations = axeResults.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        violations,
        `Axe violations on ${c.route} (${c.width}px): ${JSON.stringify(
          violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.map((n) => ({
              html: n.html,
              summary: n.failureSummary,
            })),
          })),
          null,
          2,
        )}`,
      ).toEqual([]);

      // Save full-page screenshot and above-the-fold screenshot
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${c.locale}-${c.width}-full.png`),
        fullPage: true,
      });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${c.locale}-${c.width}-fold.png`),
        fullPage: false,
      });
    });
  }

  test("FAQ keyboard accordion, language switcher, and reduced-motion work cleanly", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/", { waitUntil: "networkidle" });

    // Switch to /en via header anchor
    await page.locator("header a[href='/en']").click();
    await page.waitForURL("**/en");
    const enAttrs = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
    }));
    expect(enAttrs).toEqual({ lang: "en", dir: "ltr" });

    // FAQ second question toggles cleanly with Enter key
    const q2 = page.locator("#faq-trigger-q2");
    await q2.focus();
    expect(await q2.getAttribute("aria-expanded")).toBe("false");
    await page.keyboard.press("Enter");
    expect(await q2.getAttribute("aria-expanded")).toBe("true");
    await expect(page.locator("#faq-panel-q2")).toBeVisible();
  });

  for (const cfg of [
    {
      route: "/",
      locale: "ar",
      purchasesRe: /مشتريات المواد الغذائية الشهرية \(ريال\)/,
      purchasesSliderRe: /مؤشر مشتريات المواد الغذائية الشهرية/,
      wasteRe: /نسبة الهدر الحالية/,
      reductionRe: /نسبة خفض الهدر المتوقعة/,
    },
    {
      route: "/en",
      locale: "en",
      purchasesRe: /Monthly food purchases \(SAR\)/,
      purchasesSliderRe: /Monthly food purchases slider/,
      wasteRe: /Current waste/,
      reductionRe: /Expected waste reduction/,
    },
  ] as const) {
    test(`interactive savings calculator works cleanly at 375px in ${cfg.locale}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(cfg.route, { waitUntil: "networkidle" });

      const calc = page.locator("#calculator");
      await calc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      // Default values: 60,000 SAR, 26%, 10% -> waste 15,600, savings 1,560, yearly 18,720, plan 700, net 860
      await expect(page.getByTestId("calculator-monthly-waste")).toContainText("15,600");
      await expect(page.getByTestId("calculator-monthly-savings")).toContainText("1,560");
      await expect(page.getByTestId("calculator-yearly-savings")).toContainText("18,720");
      await expect(page.getByTestId("calculator-plan-price")).toContainText("700");
      await expect(page.getByTestId("calculator-net-after-plan")).toContainText("860");

      // Ensure Western digits (no Arabic-Indic digits ٤٦١٠ etc.)
      const monthlyText = await page.getByTestId("calculator-monthly-savings").innerText();
      expect(monthlyText).not.toMatch(/[\u0660-\u0669]/);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${cfg.locale}-375-calculator.png`),
      });

      const purchasesInput = calc.getByRole("spinbutton", { name: cfg.purchasesRe });
      const purchasesSlider = calc.getByRole("slider", { name: cfg.purchasesSliderRe });
      const wasteInput = calc.getByRole("spinbutton", { name: cfg.wasteRe });
      const reductionSlider = calc.getByRole("slider", { name: cfg.reductionRe });

      // Small tier (< 40k): 30,000 -> plan 400, waste 7,800, savings 780, net 380
      await purchasesInput.fill("30000");
      await expect(page.getByTestId("calculator-plan-price")).toContainText("400");
      await expect(page.getByTestId("calculator-monthly-savings")).toContainText("780");
      await expect(page.getByTestId("calculator-net-after-plan")).toContainText("380");

      // Purchases slider sync (> 120k): 150,000 + reduction slider 15% -> waste 39,000, savings 5,850, plan 1,200, net 4,650
      await purchasesSlider.fill("150000");
      await reductionSlider.fill("15");
      await expect(page.getByTestId("calculator-plan-price")).toContainText("1,200");
      await expect(page.getByTestId("calculator-monthly-savings")).toContainText("5,850");
      await expect(page.getByTestId("calculator-net-after-plan")).toContainText("4,650");

      // Low-volume safety: savings below plan price never display negative numbers
      await purchasesInput.fill("5000");
      await wasteInput.fill("10");
      await reductionSlider.fill("5");
      await expect(page.getByTestId("calculator-monthly-savings")).toContainText("25");
      await expect(page.getByTestId("calculator-net-after-plan")).toContainText(/^0\D/);
      await expect(page.getByTestId("calculator-net-after-plan")).not.toContainText("-");
      await expect(page.getByTestId("calculator-below-plan-note")).toBeVisible();

      // Confirm no horizontal overflow after interactive updates
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
    });
  }
});
