import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import {
  applyLocaleCookie,
  assertNoStackTraces,
  attachRuntimeErrorGuard,
  signInManager,
  signInStaffPin,
  type TestLocale,
} from "./qa-helpers";

const LOCALES: readonly TestLocale[] = ["ar", "en"];

for (const locale of LOCALES) {
  test.describe(`Core Journeys [${locale.toUpperCase()}]`, () => {
    test(`Staff journey [${locale}]: PIN login -> log (<=4 taps, <1s save) -> undo -> offline log -> sync`, async ({
      browser,
    }, testInfo) => {
      const prisma = new PrismaClient();
      const startedAt = new Date();
      const context = await browser.newContext();
      await applyLocaleCookie(context, locale);
      const page = await context.newPage();
      const runtimeErrors = attachRuntimeErrorGuard(page);

      const syncedIds: string[] = [];
      page.on("response", async (res) => {
        if (
          res.url().includes("/api/waste-entries") &&
          res.request().method() === "POST" &&
          res.ok()
        ) {
          const data = (await res.json().catch(() => null)) as {
            entry?: { clientId?: string };
          } | null;
          if (data?.entry?.clientId) syncedIds.push(data.entry.clientId);
        }
      });

      try {
        await signInStaffPin(page, "SHAMI-JED", "ahmed", "1234");
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        await expect(page.getByTestId("waste-step-1")).toBeVisible();

        // Tap 1: select first item
        let taps = 0;
        const items = page.getByTestId("waste-item-grid").locator("button");
        await items.nth(0).click();
        taps += 1;

        // Tap 2: quick-add +1
        await page.getByTestId("quick-add-1").click();
        taps += 1;

        // Tap 3: reason chip
        await page.getByTestId("reason-chip-EXPIRED").click();
        taps += 1;

        // Tap 4: save & measure local save duration (< 1000ms target)
        const saveStart = Date.now();
        await page.getByTestId("waste-save-button").click();
        taps += 1;
        await expect(page.getByTestId("waste-undo-banner")).toBeVisible();
        const localSaveMs = Date.now() - saveStart;

        expect(taps).toBeLessThanOrEqual(4);
        expect(localSaveMs).toBeLessThan(1000);

        await testInfo.attach(`staff-local-save-ms-${locale}-${testInfo.project.name}`, {
          body: String(localSaveMs),
          contentType: "text/plain",
        });
        console.info(
          `[QA_TIMING] staff_local_save_ms locale=${locale} project=${testInfo.project.name} taps=${taps} ms=${localSaveMs}`,
        );

        await expect.poll(() => syncedIds.length, { timeout: 10_000 }).toBe(1);

        // Undo the entry and verify it leaves zero active DB records from this window
        await page.getByTestId("waste-undo-button").click();
        await expect(page.getByTestId("waste-undo-banner")).toBeHidden();
        await page.waitForTimeout(500);

        // Offline log -> queue locally -> reconnect -> sync once
        await context.setOffline(true);
        await page.evaluate(() => window.dispatchEvent(new Event("offline")));
        await expect(page.getByTestId("waste-offline-badge")).toBeVisible();

        await items.nth(1).click();
        await page.getByTestId("quick-add-0.5").click();
        await page.getByTestId("reason-chip-OVER_PREPARATION").click();
        await page.getByTestId("waste-save-button").click();
        await expect(page.getByTestId("waste-sync-pending")).toContainText(/[1١]/);

        await context.setOffline(false);
        await page.evaluate(() => window.dispatchEvent(new Event("online")));
        await expect(page.getByTestId("waste-sync-pending")).toBeHidden({
          timeout: 10_000,
        });
        await expect.poll(() => syncedIds.length, { timeout: 10_000 }).toBe(2);

        await assertNoStackTraces(page);
        expect(runtimeErrors).toEqual([]);
      } finally {
        await context.close();
        const rest = await prisma.restaurant.findUniqueOrThrow({
          where: { code: "SHAMI-JED" },
          select: { id: true },
        });
        await prisma.wasteEntry.deleteMany({
          where: {
            tenantId: rest.id,
            createdAt: { gte: startedAt },
          },
        });
        await prisma.$disconnect();
      }
    });

    test(`Manager journey [${locale}]: login -> add menu item -> import sales -> dashboard (<2s) -> monthly report`, async ({
      browser,
    }, testInfo) => {
      const prisma = new PrismaClient();
      const restaurantCode = locale === "ar" ? "SHAMI-JED" : "DIWAN-MKH";
      const email =
        locale === "ar" ? "manager@shami.sa" : "manager@diwan-makkah.sa";
      const password =
        locale === "ar" ? "ShamiManager!2026" : "DiwanManager!2026";
      const suffix = `${Date.now()}-${testInfo.project.name}`;
      const uniqueItemEn = `QA Item ${suffix}`;
      const uniqueItemAr = `صنف جودة ${suffix}`;

      const context = await browser.newContext();
      await applyLocaleCookie(context, locale);
      const page = await context.newPage();
      const runtimeErrors = attachRuntimeErrorGuard(page);

      const rest = await prisma.restaurant.findUniqueOrThrow({
        where: { code: restaurantCode },
        select: { id: true },
      });

      try {
        await signInManager(page, email, password);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );

        // 1) Add a menu item on /menu
        await page.goto("/menu");
        await page.getByTestId("open-add-item-dialog").click();
        await page.getByTestId("menu-input-name-ar").fill(uniqueItemAr);
        await page.getByTestId("menu-input-name-en").fill(uniqueItemEn);
        await page.getByTestId("menu-input-category").fill("Mains");
        await page.getByTestId("menu-input-unit-cost").fill("18.50");
        await page.getByTestId("menu-submit-button").click();
        await expect(page.getByText(uniqueItemAr).first()).toBeVisible({
          timeout: 10_000,
        });

        // 2) Import sales CSV matching the newly added item directly
        await page.goto("/imports");
        const csvContent = [
          "\uFEFFDate,Item Name,Quantity Sold,Channel",
          `2097-08-15,${uniqueItemEn},12,DINE_IN`,
        ].join("\n");
        await page.locator("#import-file-input").setInputFiles({
          name: `qa-${suffix}.csv`,
          mimeType: "text/csv",
          buffer: Buffer.from(csvContent, "utf8"),
        });
        await expect(page.getByTestId("preview-valid-badge")).toContainText(
          /[1١]/,
          { timeout: 15_000 },
        );
        await page.getByTestId("confirm-import-btn").click();
        await expect(
          page.getByTestId("import-history-table").getByText(`qa-${suffix}.csv`),
        ).toBeVisible({ timeout: 15_000 });

        // 3) Measure /dashboard load time (< 2000ms target)
        const navStart = Date.now();
        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("manager-dashboard")).toBeVisible();
        const clientDashboardMs = Date.now() - navStart;
        const serverLoadMs = Number(
          await page.getByTestId("manager-dashboard").getAttribute("data-server-load-ms"),
        );
        await testInfo.attach(
          `dashboard-ms-${locale}-${testInfo.project.name}`,
          {
            body: `client=${clientDashboardMs} server=${serverLoadMs}`,
            contentType: "text/plain",
          },
        );
        console.info(
          `[QA_TIMING] dashboard_ms locale=${locale} project=${testInfo.project.name} serverMs=${serverLoadMs} clientMs=${clientDashboardMs}`,
        );
        expect(serverLoadMs).toBeLessThan(2000);
        expect(clientDashboardMs).toBeLessThan(2500);

        // 4) Open /reports -> /reports/2026-08
        await page.goto("/reports");
        await page.locator('a[href="/reports/2026-08"]').first().click();
        await page.waitForURL("**/reports/2026-08");
        await expect(page.locator("h1")).toBeVisible();
        await assertNoStackTraces(page);
        expect(runtimeErrors).toEqual([]);
      } finally {
        await context.close();
        await prisma.salesRecord.deleteMany({
          where: { tenantId: rest.id, date: new Date("2097-08-15T00:00:00.000Z") },
        });
        await prisma.importBatch.deleteMany({
          where: { tenantId: rest.id, fileName: `qa-${suffix}.csv` },
        });
        await prisma.menuItem.deleteMany({
          where: { tenantId: rest.id, name: uniqueItemEn },
        });
        await prisma.$disconnect();
      }
    });
  });
}
