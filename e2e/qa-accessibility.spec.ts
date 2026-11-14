import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  applyLocaleCookie,
  signInManager,
  signInStaffPin,
  type TestLocale,
} from "./qa-helpers";

async function assertNoSeriousA11yViolations(page: Page, routeName: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    seriousOrCritical,
    `Axe serious/critical violations on ${routeName}: ${JSON.stringify(
      seriousOrCritical.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => n.html),
      })),
      null,
      2,
    )}`,
  ).toEqual([]);
}

async function assertKeyboardFocusVisible(page: Page, label: string) {
  let sawVisibleFocus = false;
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const focusInfo = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = window.getComputedStyle(el);
      const hasOutline =
        style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
      const hasShadowRing =
        style.boxShadow !== "none" && style.boxShadow.length > 0;
      const matchesFocusVisible = el.matches(":focus-visible");
      return {
        tag: el.tagName,
        matchesFocusVisible,
        hasVisibleIndicator: hasOutline || hasShadowRing,
      };
    });
    if (focusInfo?.matchesFocusVisible && focusInfo.hasVisibleIndicator) {
      sawVisibleFocus = true;
      break;
    }
  }
  expect(sawVisibleFocus, `Expected visible keyboard focus on ${label}`).toBe(true);
}

for (const locale of ["ar", "en"] as const satisfies readonly TestLocale[]) {
  test.describe(`Accessibility & Keyboard [${locale.toUpperCase()}]`, () => {
    test(`axe-core WCAG 2A/2AA and keyboard focus on /login and /log [${locale}]`, async ({
      browser,
    }) => {
      const context = await browser.newContext();
      await applyLocaleCookie(context, locale);
      const page = await context.newPage();

      try {
        await page.goto("/login", { waitUntil: "networkidle" });
        await assertNoSeriousA11yViolations(page, `/login (${locale})`);
        await assertKeyboardFocusVisible(page, `/login (${locale})`);

        await signInStaffPin(page, "SHAMI-JED", "ahmed", "1234");
        await page.waitForLoadState("networkidle");
        await assertNoSeriousA11yViolations(page, `/log (${locale})`);
        await assertKeyboardFocusVisible(page, `/log (${locale})`);
      } finally {
        await context.close();
      }
    });

    test(`axe-core WCAG 2A/2AA and keyboard focus on /dashboard, /reports, /reports/2026-08 [${locale}]`, async ({
      browser,
    }) => {
      const context = await browser.newContext();
      await applyLocaleCookie(context, locale);
      const page = await context.newPage();

      try {
        await signInManager(page, "manager@shami.sa", "ShamiManager!2026");
        await page.waitForLoadState("networkidle");
        await assertNoSeriousA11yViolations(page, `/dashboard (${locale})`);
        await assertKeyboardFocusVisible(page, `/dashboard (${locale})`);

        await page.goto("/reports", { waitUntil: "networkidle" });
        await assertNoSeriousA11yViolations(page, `/reports (${locale})`);
        await assertKeyboardFocusVisible(page, `/reports (${locale})`);

        await page.goto("/reports/2026-08", { waitUntil: "networkidle" });
        await assertNoSeriousA11yViolations(page, `/reports/2026-08 (${locale})`);
      } finally {
        await context.close();
      }
    });
  });
}
