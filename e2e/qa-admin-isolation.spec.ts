import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import {
  applyLocaleCookie,
  attachRuntimeErrorGuard,
  signInAdmin,
  signInManager,
  type TestLocale,
} from "./qa-helpers";

for (const locale of ["ar", "en"] as const satisfies readonly TestLocale[]) {
  test.describe(`Admin & Isolation Journeys [${locale.toUpperCase()}]`, () => {
    test(`Admin journey [${locale}]: create restaurant -> suspend -> reactivate`, async ({
      browser,
    }, testInfo) => {
      const prisma = new PrismaClient();
      const context = await browser.newContext();
      await applyLocaleCookie(context, locale);
      const page = await context.newPage();
      const runtimeErrors = attachRuntimeErrorGuard(page);

      const token = `${locale}-${testInfo.project.name}-${Date.now().toString().slice(-5)}`;
      const uniqueEmail = `qa-adm-${token}@example.com`;
      let createdRestaurantId: string | null = null;

      try {
        await signInAdmin(page);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );

        await page.getByTestId("open-create-restaurant").click();
        await page.locator("#admin-create-name-en").fill(`QA Rest ${token}`);
        await page.locator("#admin-create-name-ar").fill(`مطعم تجربة ${token}`);
        await page.locator("#admin-create-city").fill("Khobar");
        await page.locator("#admin-create-type").fill("Casual Dining");
        await page.locator("#admin-create-mgr-name").fill("QA Owner");
        await page.locator("#admin-create-mgr-email").fill(uniqueEmail);
        await page.getByTestId("submit-create-restaurant").click();

        await expect(page.getByTestId("created-credentials-panel")).toBeVisible({
          timeout: 15_000,
        });
        const code = (
          await page.getByTestId("created-restaurant-code").innerText()
        ).trim();
        const password = (
          await page.getByTestId("created-temp-password").innerText()
        ).trim();
        await page.getByTestId("close-created-credentials").click();

        const created = await prisma.restaurant.findUniqueOrThrow({
          where: { code },
          select: { id: true },
        });
        createdRestaurantId = created.id;

        // Suspend -> blocked login
        await page.getByTestId(`suspend-toggle-${code}`).click();
        await expect(page.getByTestId(`customer-row-${code}`)).toHaveAttribute(
          "data-status",
          "SUSPENDED",
          { timeout: 10_000 },
        );

        const suspCtx = await browser.newContext();
        await applyLocaleCookie(suspCtx, locale);
        try {
          const sPage = await suspCtx.newPage();
          await sPage.goto("/login");
          await sPage.locator("#manager-email").fill(uniqueEmail);
          await sPage.locator("#manager-password").fill(password);
          await sPage.locator('form button[type="submit"]').click();
          await expect(
            sPage.locator('[role="alert"]:not(#__next-route-announcer__)').first(),
          ).toContainText(/suspended|تم تعليق حساب/i);
        } finally {
          await suspCtx.close();
        }

        // Reactivate -> login succeeds
        await page.getByTestId(`suspend-toggle-${code}`).click();
        await expect(
          page.getByTestId(`customer-row-${code}`),
        ).not.toHaveAttribute("data-status", "SUSPENDED", { timeout: 10_000 });

        const okCtx = await browser.newContext();
        await applyLocaleCookie(okCtx, locale);
        try {
          const mPage = await okCtx.newPage();
          await signInManager(mPage, uniqueEmail, password);
          await expect(mPage.getByTestId("manager-dashboard")).toBeVisible();
        } finally {
          await okCtx.close();
        }

        expect(runtimeErrors).toEqual([]);
      } finally {
        await context.close();
        if (createdRestaurantId) {
          await prisma.auditLog.deleteMany({
            where: { tenantId: createdRestaurantId },
          });
          await prisma.restaurant.deleteMany({
            where: { id: createdRestaurantId },
          });
        }
        await prisma.$disconnect();
      }
    });

    test(`Isolation journey [${locale}]: SHAMI-JED vs DIWAN-MKH never leak across UI or APIs`, async ({
      browser,
    }, testInfo) => {
      const prisma = new PrismaClient();
      const token = `ISO-${locale}-${testInfo.project.name}-${Date.now().toString().slice(-6)}`;
      const shamiRest = await prisma.restaurant.findUniqueOrThrow({
        where: { code: "SHAMI-JED" },
        select: { id: true },
      });

      const shamiMenuItem = await prisma.menuItem.create({
        data: {
          tenantId: shamiRest.id,
          code: token,
          name: `Secret Item ${token}`,
          nameAr: `صنف سري ${token}`,
          category: "Mains",
          unit: "KG",
          unitCost: "50.00",
        },
      });

      const diwanCtx = await browser.newContext();
      await applyLocaleCookie(diwanCtx, locale);
      const diwanPage = await diwanCtx.newPage();

      try {
        await signInManager(diwanPage, "manager@diwan-makkah.sa", "DiwanManager!2026");

        for (const route of ["/menu", "/dashboard", "/log", "/reports"]) {
          await diwanPage.goto(route);
          await expect(diwanPage.getByText(token)).toHaveCount(0);
          await expect(diwanPage.getByText(`Secret Item ${token}`)).toHaveCount(0);
        }

        const menuApiRes = await diwanPage.request.get("/api/menu");
        expect(menuApiRes.ok()).toBe(true);
        expect(await menuApiRes.text()).not.toContain(token);

        const wasteApiRes = await diwanPage.request.get("/api/waste-entries");
        expect(wasteApiRes.ok()).toBe(true);
        expect(await wasteApiRes.text()).not.toContain(token);
      } finally {
        await diwanCtx.close();
        await prisma.menuItem.deleteMany({ where: { id: shamiMenuItem.id } });
        await prisma.$disconnect();
      }
    });
  });
}
