import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, type Page, test } from "@playwright/test";
import { readToolingEnv } from "../src/env.core";

function attachErrorListeners(page: Page, bucket: string[]) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (
        text.includes("Hydration failed") ||
        text.includes("hydration-mismatch") ||
        text.includes("didn't match the client") ||
        text.includes("MISSING_MESSAGE") ||
        text.includes("Uncaught")
      ) {
        bucket.push(text);
      }
    }
  });
  page.on("pageerror", (err) => {
    bucket.push(err.message);
  });
}

test.describe("Platform Admin console (/admin) E2E flow", () => {
  test("blocks non-admin roles, creates restaurant with temp password, logs in as new manager in isolated private context, and enforces suspension", async ({
    browser,
  }) => {
    const prisma = new PrismaClient();
    const screenshotDir = readToolingEnv().ADMIN_SCREENSHOT_DIR;
    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const token = randomUUID().slice(0, 6).toUpperCase();
    const uniqueEmail = `mgr.${token.toLowerCase()}@wafrah-e2e.sa`;
    let createdRestaurantId: string | null = null;
    const runtimeErrors: string[] = [];

    const nonAdminContext = await browser.newContext();
    const adminContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const privateManagerContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    try {
      // 1) Confirm non-admin (MANAGER) is blocked from /admin and /api/admin/overview
      const mgrPage = await nonAdminContext.newPage();
      await mgrPage.goto("/login");
      await mgrPage.locator("#manager-email").fill("manager@shami.sa");
      await mgrPage.locator("#manager-password").fill("ShamiManager!2026");
      await mgrPage.locator('form button[type="submit"]').click();
      await mgrPage.waitForURL("**/dashboard**");

      await mgrPage.goto("/admin");
      await mgrPage.waitForURL("**/dashboard**");
      expect(mgrPage.url()).not.toContain("/admin");

      const forbiddenOverview = await mgrPage.request.get("/api/admin/overview");
      expect(forbiddenOverview.status()).toBe(403);
      await nonAdminContext.close();

      // 2) Sign in as PLATFORM_ADMIN in desktop context
      const adminPage = await adminContext.newPage();
      attachErrorListeners(adminPage, runtimeErrors);

      await adminPage.goto("/login");
      await adminPage.locator("#manager-email").fill("admin@wafrah.sa");
      await adminPage.locator("#manager-password").fill("WafrahAdmin!2026");
      await adminPage.locator('form button[type="submit"]').click();
      await adminPage.waitForURL("**/admin**");

      await expect(adminPage.getByTestId("admin-console")).toBeVisible();
      await expect(adminPage.getByTestId("admin-customers-table")).toBeVisible();
      await expect(adminPage.getByTestId("customer-row-SHAMI-JED")).toBeVisible();
      await expect(adminPage.getByTestId("customer-row-DIWAN-MKH")).toBeVisible();

      // Verify zero "View as manager" impersonation action
      await expect(adminPage.getByText(/view as manager/i)).toHaveCount(0);

      // Verify Read-only Support Diagnostics modal
      await adminPage.getByTestId("diagnostics-SHAMI-JED").click();
      await expect(adminPage.getByTestId("diagnostics-content")).toBeVisible();
      await adminPage.keyboard.press("Escape");
      await expect(adminPage.getByTestId("diagnostics-content")).toHaveCount(0);

      if (screenshotDir) {
        await adminPage.screenshot({
          path: path.join(screenshotDir, "admin-customers-ar.png"),
          fullPage: true,
        });
      }

      // Switch to English LTR briefly to verify localization + Health tab
      await adminPage.getByTestId("language-switcher").click();
      await expect(adminPage.locator("html")).toHaveAttribute("dir", "ltr", {
        timeout: 10_000,
      });

      await adminPage.getByTestId("tab-health").click();
      await expect(adminPage.getByTestId("cron-job-daily")).toBeVisible();
      await expect(adminPage.getByTestId("wape-row-SHAMI-JED")).toBeVisible();

      if (screenshotDir) {
        await adminPage.screenshot({
          path: path.join(screenshotDir, "admin-health-en.png"),
          fullPage: true,
        });
      }

      // Back to Customers tab and create a new restaurant
      await adminPage.getByTestId("tab-customers").click();
      await adminPage.getByTestId("open-create-restaurant").click();

      await adminPage.locator("#admin-create-name-en").fill(`Khobar ${token}`);
      await adminPage
        .locator("#admin-create-name-ar")
        .fill(`مطبخ الخبر ${token}`);
      await adminPage.locator("#admin-create-city").fill("Khobar");
      await adminPage.locator("#admin-create-type").fill("Casual Dining");
      await adminPage.locator("#admin-create-mgr-name").fill("Faisal Al-Dosari");
      await adminPage.locator("#admin-create-mgr-email").fill(uniqueEmail);

      await adminPage.getByTestId("submit-create-restaurant").click();
      await expect(
        adminPage.getByTestId("created-credentials-panel"),
      ).toBeVisible({ timeout: 15_000 });

      const generatedCode = (
        await adminPage.getByTestId("created-restaurant-code").innerText()
      ).trim();
      const generatedEmail = (
        await adminPage.getByTestId("created-manager-email").innerText()
      ).trim();
      const tempPassword = (
        await adminPage.getByTestId("created-temp-password").innerText()
      ).trim();

      expect(generatedCode).toContain("-KHB");
      expect(generatedEmail).toBe(uniqueEmail);
      expect(tempPassword.length).toBeGreaterThanOrEqual(12);

      const createdRecord = await prisma.restaurant.findUniqueOrThrow({
        where: { code: generatedCode },
        select: { id: true },
      });
      createdRestaurantId = createdRecord.id;

      if (screenshotDir) {
        await adminPage.screenshot({
          path: path.join(screenshotDir, "admin-created-credentials.png"),
          fullPage: true,
        });
      }

      await adminPage.getByTestId("close-created-credentials").click();
      await expect(
        adminPage.getByTestId(`customer-row-${generatedCode}`),
      ).toBeVisible();

      // 3) Log in as the new manager inside an isolated private browser context
      const mgrPrivatePage = await privateManagerContext.newPage();
      attachErrorListeners(mgrPrivatePage, runtimeErrors);

      await mgrPrivatePage.goto("/login");
      await mgrPrivatePage.locator("#manager-email").fill(generatedEmail);
      await mgrPrivatePage.locator("#manager-password").fill(tempPassword);
      await mgrPrivatePage.locator('form button[type="submit"]').click();
      await mgrPrivatePage.waitForURL("**/dashboard**", { timeout: 15_000 });

      await expect(mgrPrivatePage.locator("h1")).toBeVisible();
      if (screenshotDir) {
        await mgrPrivatePage.screenshot({
          path: path.join(screenshotDir, "new-manager-dashboard.png"),
          fullPage: true,
        });
      }

      // 4) Suspend the new restaurant in Admin and verify a fresh login is blocked cleanly
      await adminPage.getByTestId(`suspend-toggle-${generatedCode}`).click();
      await expect(
        adminPage.getByTestId(`customer-row-${generatedCode}`),
      ).toHaveAttribute("data-status", "SUSPENDED", { timeout: 10_000 });

      const suspendedLoginContext = await browser.newContext();
      try {
        const suspendedPage = await suspendedLoginContext.newPage();
        await suspendedPage.goto("/login");
        await suspendedPage.locator("#manager-email").fill(generatedEmail);
        await suspendedPage.locator("#manager-password").fill(tempPassword);
        await suspendedPage.locator('form button[type="submit"]').click();

        const alertBanner = suspendedPage
          .locator('[role="alert"]:not(#__next-route-announcer__)')
          .first();
        await expect(alertBanner).toBeVisible({ timeout: 10_000 });
        await expect(alertBanner).toContainText(/suspended|تم تعليق حساب/i);
        expect(suspendedPage.url()).toContain("/login");
      } finally {
        await suspendedLoginContext.close();
      }

      // 5) Reactivate the restaurant in Admin and verify manager login works again
      await adminPage.getByTestId(`suspend-toggle-${generatedCode}`).click();
      await expect(
        adminPage.getByTestId(`customer-row-${generatedCode}`),
      ).not.toHaveAttribute("data-status", "SUSPENDED", { timeout: 10_000 });

      const reactivatedLoginContext = await browser.newContext();
      try {
        const reactivatedPage = await reactivatedLoginContext.newPage();
        await reactivatedPage.goto("/login");
        await reactivatedPage.locator("#manager-email").fill(generatedEmail);
        await reactivatedPage.locator("#manager-password").fill(tempPassword);
        await reactivatedPage.locator('form button[type="submit"]').click();
        await reactivatedPage.waitForURL("**/dashboard**", { timeout: 15_000 });
        await expect(reactivatedPage.locator("h1")).toBeVisible();
      } finally {
        await reactivatedLoginContext.close();
      }

      expect(runtimeErrors).toEqual([]);
    } finally {
      await adminContext.close().catch(() => undefined);
      await privateManagerContext.close().catch(() => undefined);
      if (createdRestaurantId) {
        await prisma.auditLog.deleteMany({
          where: { tenantId: createdRestaurantId },
        });
        await prisma.restaurant.deleteMany({
          where: { id: createdRestaurantId },
        });
      }
      await prisma.user.updateMany({
        where: { email: "admin@wafrah.sa" },
        data: { locale: "ar" },
      });
      await prisma.$disconnect();
    }
  });
});
