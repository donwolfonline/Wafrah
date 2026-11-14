import { type BrowserContext, expect, type Page } from "@playwright/test";

export type TestLocale = "ar" | "en";

export const APP_BASE_URL = process.env.APP_URL ?? "http://localhost:3000";

export async function applyLocaleCookie(
  context: BrowserContext,
  locale: TestLocale,
): Promise<void> {
  await context.addCookies([
    {
      name: "NEXT_LOCALE",
      value: locale,
      url: APP_BASE_URL,
    },
  ]);
}

export function attachRuntimeErrorGuard(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (
        text.includes("Hydration failed") ||
        text.includes("hydration-mismatch") ||
        text.includes("didn't match the client") ||
        text.includes("MISSING_MESSAGE")
      ) {
        errors.push(`console.error: ${text}`);
      }
    }
  });
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}

export async function signInManager(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.locator("#manager-email").fill(email);
  await page.locator("#manager-password").fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL("**/dashboard**", { timeout: 15_000 });
}

export async function signInAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#manager-email").fill("admin@wafrah.sa");
  await page.locator("#manager-password").fill("WafrahAdmin!2026");
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL("**/admin**", { timeout: 15_000 });
}

export async function signInStaffPin(
  page: Page,
  restaurantCode: string,
  username: string,
  pin: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByRole("tab", { name: /طاقم المطبخ|Kitchen staff/i }).click();
  await page.locator("#staff-restaurant-code").fill(restaurantCode);
  await page.locator("#staff-username").fill(username);
  await page.locator("#staff-pin").fill(pin);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL("**/log**", { timeout: 15_000 });
}

export async function assertNoStackTraces(page: Page): Promise<void> {
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/PrismaClient|TypeError:|ReferenceError:|node_modules|\.tsx?:\d+:\d+|at\s+\w+\s+\(/);
}
