import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test.describe("Sales & Purchases Imports (/imports)", () => {
  test("imports a sales CSV twice cleanly with unmatched mapping, duplicate detection, and zero DB duplicates", async ({
    page,
  }) => {
    const prisma = new PrismaClient();
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { code: "SHAMI-JED" },
    });

    const d1 = new Date("2098-11-10T00:00:00.000Z");
    const d2 = new Date("2098-11-11T00:00:00.000Z");

    const sampleCsvContent = [
      "\uFEFFالتاريخ;اسم الصنف;الكمية المباعة;قناة البيع",
      "2098-11-10;أرز بسمتي مندي;25;صالة",
      "2098-11-11;CustomPosChicken;18;توصيل",
      "2098-11-11;SHM-LAMB;-4;صالة",
    ].join("\n");

    try {
      await page.goto("/login");
      await page.locator("#manager-email").fill("manager@shami.sa");
      await page.locator("#manager-password").fill("ShamiManager!2026");
      await page.locator('form button[type="submit"]').click();

      await page.waitForURL("**/dashboard");
      await page.goto("/imports");
      await page.waitForLoadState("networkidle");

      const historyRows = page
        .getByTestId("import-history-table")
        .locator("tbody tr")
        .filter({ hasText: "e2e-sales-test.csv" });
      const initialMatchingHistory = await historyRows.count();

      // First upload: upload CSV file
      await page.locator("#import-file-input").setInputFiles({
        name: "e2e-sales-test.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(sampleCsvContent, "utf8"),
      });

      // Wait for server parse & compilation
      await expect(page.getByTestId("preview-valid-badge")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("preview-rejected-badge")).toBeVisible();

      // Map unmatched item CustomPosChicken to an existing menu item
      const unmatchedSelect = page.getByTestId(
        "unmatched-select-CustomPosChicken",
      );
      await expect(unmatchedSelect).toBeVisible();
      await unmatchedSelect.click();
      await page.getByRole("option").nth(1).click();

      // Wait for re-evaluation (2 valid rows) and confirm import
      await expect(page.getByTestId("preview-valid-badge")).toContainText(
        /[2٢]/,
        { timeout: 15_000 },
      );
      await expect(page.getByTestId("confirm-import-btn")).toBeEnabled();
      await page.getByTestId("confirm-import-btn").click();

      await expect(historyRows).toHaveCount(initialMatchingHistory + 1, {
        timeout: 15_000,
      });

      const countAfterFirst = await prisma.salesRecord.count({
        where: { tenantId: restaurant.id, date: { in: [d1, d2] } },
      });
      expect(countAfterFirst).toBe(2);

      // Second upload: re-import the exact same CSV file
      await page.locator("#import-file-input").setInputFiles({
        name: "e2e-sales-test.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(sampleCsvContent, "utf8"),
      });

      await expect(
        page.getByTestId("unmatched-select-CustomPosChicken"),
      ).toBeVisible({ timeout: 15_000 });
      await page.getByTestId("unmatched-select-CustomPosChicken").click();
      await page.getByRole("option").nth(1).click();

      // Duplicates badge must detect both existing records
      await expect(page.getByTestId("preview-duplicates-badge")).toContainText(
        /[2٢]/,
        { timeout: 15_000 },
      );

      await page.getByTestId("confirm-import-btn").click();
      await expect(historyRows).toHaveCount(initialMatchingHistory + 2, {
        timeout: 15_000,
      });

      // Verify zero duplicate rows created in PostgreSQL
      const countAfterSecond = await prisma.salesRecord.count({
        where: { tenantId: restaurant.id, date: { in: [d1, d2] } },
      });
      expect(countAfterSecond).toBe(2);
    } finally {
      await prisma.salesRecord.deleteMany({
        where: { tenantId: restaurant.id, date: { in: [d1, d2] } },
      });
      const testBatches = await prisma.importBatch.findMany({
        where: { tenantId: restaurant.id, fileName: "e2e-sales-test.csv" },
        select: { id: true },
      });
      const batchIds = testBatches.map((b) => b.id);
      if (batchIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { entity: "ImportBatch", entityId: { in: batchIds } },
        });
        await prisma.importBatch.deleteMany({
          where: { id: { in: batchIds } },
        });
      }
      await prisma.importColumnMapping.deleteMany({
        where: { tenantId: restaurant.id },
      });
      await prisma.$disconnect();
    }
  });
});
