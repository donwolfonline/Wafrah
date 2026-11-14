import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { hashSecret } from "../src/lib/password";
import {
  applyLocaleCookie,
  assertNoStackTraces,
  attachRuntimeErrorGuard,
  signInAdmin,
  signInManager,
  signInStaffPin,
  type TestLocale,
} from "./qa-helpers";

test.describe("Empty & Error States (AR/EN, no stack traces)", () => {
  for (const locale of ["ar", "en"] as const satisfies readonly TestLocale[]) {
    test(`New empty restaurant, invalid CSV, network failure on sync, and expired session [${locale}]`, async ({
      browser,
    }) => {
      const prisma = new PrismaClient();
      const emptyCode = `QA-EMP-${locale.toUpperCase()}-${Date.now().toString().slice(-4)}`;
      const emptyEmail = `qa-empty-${locale}-${Date.now()}@example.com`;
      const tempRest = await prisma.restaurant.create({
        data: {
          code: emptyCode,
          name: `Empty Rest ${locale}`,
          nameAr: `مطعم فارغ ${locale}`,
          city: "Jeddah",
          type: "Cafe",
          users: {
            create: {
              email: emptyEmail,
              name: "Empty Manager",
              username: "manager",
              role: "OWNER",
              passwordHash: hashSecret("EmptyMgr!2026"),
              locale,
            },
          },
        },
      });

      const emptyCtx = await browser.newContext();
      await applyLocaleCookie(emptyCtx, locale);
      const emptyPage = await emptyCtx.newPage();

      const staffCtx = await browser.newContext({ serviceWorkers: "block" });
      await applyLocaleCookie(staffCtx, locale);
      const staffPage = await staffCtx.newPage();

      const mgrCtx = await browser.newContext();
      await applyLocaleCookie(mgrCtx, locale);
      const mgrPage = await mgrCtx.newPage();

      try {
        // 1) New empty restaurant: helpful empty states on /dashboard, /menu, /reports, /log
        await signInManager(emptyPage, emptyEmail, "EmptyMgr!2026");
        await expect(
          emptyPage.getByTestId("dashboard-onboarding-checklist"),
        ).toBeVisible();
        await assertNoStackTraces(emptyPage);

        for (const r of ["/menu", "/reports", "/log"]) {
          await emptyPage.goto(r);
          await expect(emptyPage.locator("h1, h2").first()).toBeVisible();
          await assertNoStackTraces(emptyPage);
        }

        // 2) Invalid CSV (malformed & >50% invalid rows) shows localized alert
        await signInManager(
          mgrPage,
          locale === "ar" ? "manager@shami.sa" : "manager@diwan-makkah.sa",
          locale === "ar" ? "ShamiManager!2026" : "DiwanManager!2026",
        );
        await mgrPage.goto("/imports");
        await mgrPage.locator("#import-file-input").setInputFiles({
          name: "bad-header-only.csv",
          mimeType: "text/csv",
          buffer: Buffer.from("Date,Item,Qty\n", "utf8"),
        });
        await expect(mgrPage.getByTestId("import-error-alert")).toBeVisible({
          timeout: 10_000,
        });
        await assertNoStackTraces(mgrPage);

        const mostlyInvalidCsv = [
          "Date,Item Name,Quantity Sold,Channel",
          "not-a-date,UnknownA,bad-qty,DINE_IN",
          "not-a-date,UnknownB,-9,DINE_IN",
        ].join("\n");
        await mgrPage.locator("#import-file-input").setInputFiles({
          name: "mostly-invalid.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(mostlyInvalidCsv, "utf8"),
        });
        await expect(mgrPage.getByTestId("over-rejection-alert")).toBeVisible({
          timeout: 10_000,
        });

        // 3) Network failure on waste sync shows helpful retry alert + retry button, then 401 expiry
        await signInStaffPin(staffPage, "SHAMI-JED", "ahmed", "1234");
        await expect(staffPage.getByTestId("waste-step-1")).toBeVisible();
        await staffPage.waitForLoadState("networkidle");
        let abortSync = true;
        await staffPage.route("**/api/waste-entries", async (route) => {
          if (route.request().method() === "POST" && abortSync) {
            await route.abort("failed");
            return;
          }
          await route.continue();
        });

        await staffPage
          .getByTestId("waste-item-grid")
          .locator("button")
          .nth(0)
          .click();
        await staffPage.getByTestId("quick-add-1").click();
        await staffPage.getByTestId("waste-save-button").click();

        await expect(staffPage.getByTestId("waste-sync-error")).toBeVisible({
          timeout: 10_000,
        });
        await expect(staffPage.getByTestId("waste-sync-retry")).toBeVisible();
        await assertNoStackTraces(staffPage);

        abortSync = false;
        await staffPage.getByTestId("waste-sync-retry").click();
        await expect(staffPage.getByTestId("waste-sync-pending")).toBeHidden({
          timeout: 10_000,
        });

        // Cleanup the synced smoke entry right away
        const shami = await prisma.restaurant.findUniqueOrThrow({
          where: { code: "SHAMI-JED" },
          select: { id: true },
        });
        await prisma.wasteEntry.deleteMany({
          where: { tenantId: shami.id, createdAt: { gte: tempRest.createdAt } },
        });

        // 4) Expired session cookie redirects to /login?reason=expired with helpful notice
        await emptyCtx.addCookies([
          {
            name: "authjs.session-token",
            value: "expired.invalid.token",
            url: emptyPage.url(),
          },
        ]);
        await emptyPage.goto("/dashboard");
        await emptyPage.waitForURL("**/login?reason=expired**");
        await expect(emptyPage.getByTestId("login-expired-notice")).toBeVisible();
        await assertNoStackTraces(emptyPage);

        // 5) 401 session expiry during /log sync preserves queued item & shows sign-in banner
        await staffPage.route("**/api/waste-entries", async (route) => {
          if (route.request().method() === "POST") {
            await route.fulfill({
              status: 401,
              contentType: "application/json",
              body: JSON.stringify({ error: "Unauthenticated" }),
            });
            return;
          }
          await route.continue();
        });
        await staffPage
          .getByTestId("waste-item-grid")
          .locator("button")
          .nth(0)
          .click();
        await staffPage.getByTestId("quick-add-1").click();
        await staffPage.getByTestId("waste-save-button").click();
        await expect(staffPage.getByTestId("waste-auth-expired")).toBeVisible({
          timeout: 10_000,
        });
        await expect(staffPage.getByTestId("waste-sync-pending")).toContainText(/[1١]/);
        await assertNoStackTraces(staffPage);
      } finally {
        await emptyCtx.close();
        await staffCtx.close();
        await mgrCtx.close();
        const shamiCleanup = await prisma.restaurant.findUnique({
          where: { code: "SHAMI-JED" },
          select: { id: true },
        });
        if (shamiCleanup) {
          await prisma.wasteEntry.deleteMany({
            where: {
              tenantId: shamiCleanup.id,
              createdAt: { gte: tempRest.createdAt },
            },
          });
        }
        await prisma.restaurant.deleteMany({ where: { id: tempRest.id } });
        await prisma.$disconnect();
      }
    });
  }
});

test.describe("Arabic RTL Visual Review (375px & 1280px)", () => {
  test("captures Arabic RTL pages at 375px and 1280px with dir=rtl and zero horizontal overflow", async ({
    browser,
  }) => {
    const outDir = process.env.QA_SCREENSHOT_DIR;
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const viewports = [
      { name: "mobile-375", width: 375, height: 812 },
      { name: "desktop-1280", width: 1280, height: 800 },
    ];

    for (const vp of viewports) {
      const guestCtx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      await applyLocaleCookie(guestCtx, "ar");
      const guestPage = await guestCtx.newPage();
      const errors = attachRuntimeErrorGuard(guestPage);

      const managerCtx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      await applyLocaleCookie(managerCtx, "ar");
      const mgrPage = await managerCtx.newPage();

      const adminCtx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      await applyLocaleCookie(adminCtx, "ar");
      const admPage = await adminCtx.newPage();

      const captureAndVerify = async (page: typeof guestPage, slug: string, route: string) => {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(
          overflow.scrollWidth,
          `Horizontal overflow on ${route} (${vp.name}): scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
        if (outDir) {
          await page.screenshot({
            path: path.join(outDir, `${vp.name}-${slug}.png`),
            fullPage: true,
          });
        }
      };

      try {
        await captureAndVerify(guestPage, "login", "/login");
        await captureAndVerify(guestPage, "privacy", "/privacy");
        await captureAndVerify(guestPage, "terms", "/terms");

        await signInManager(mgrPage, "manager@shami.sa", "ShamiManager!2026");
        for (const [slug, route] of [
          ["dashboard", "/dashboard"],
          ["log", "/log"],
          ["menu", "/menu"],
          ["imports", "/imports"],
          ["reports", "/reports"],
          ["report-detail", "/reports/2026-08"],
          ["notifications", "/settings/notifications"],
        ] as const) {
          await captureAndVerify(mgrPage, slug, route);
        }

        await signInAdmin(admPage);
        await captureAndVerify(admPage, "admin", "/admin");
        expect(errors).toEqual([]);
      } finally {
        await guestCtx.close();
        await managerCtx.close();
        await adminCtx.close();
      }
    }
  });
});
