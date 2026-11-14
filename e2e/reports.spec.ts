import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test.describe("Reports (/reports and /reports/[yyyy-mm]) — AR/EN, baseline settings, CSV & honest savings", () => {
  test("lists months, persists baseline edits, renders 2026-08 savings & 2026-11 increase in AR and EN, and exports CSV", async ({
    page,
  }) => {
    const prisma = new PrismaClient();
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { code: "SHAMI-JED" },
      select: { id: true, baselineStart: true, baselineEnd: true },
    });
    const manager = await prisma.user.findUniqueOrThrow({
      where: { email: "manager@shami.sa" },
      select: { id: true, locale: true },
    });

    await prisma.user.update({
      where: { id: manager.id },
      data: { locale: "ar" },
    });

    const runtimeErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (
          text.includes("Hydration failed") ||
          text.includes("hydration-mismatch") ||
          text.includes("didn't match the client") ||
          text.includes("MISSING_MESSAGE")
        ) {
          runtimeErrors.push(text);
        }
      }
    });
    page.on("pageerror", (err) => {
      runtimeErrors.push(err.message);
    });

    try {
      await page.goto("/login");
      await page.locator("#manager-email").fill("manager@shami.sa");
      await page.locator("#manager-password").fill("ShamiManager!2026");
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL("**/dashboard**");

      await page.goto("/reports");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("lang", "ar");
      await expect(
        page.getByRole("heading", { name: "تقارير الوفر الشهري بالريال السعودي" }),
      ).toBeVisible();

      // All 5 seeded months appear
      for (const monthHref of [
        "/reports/2026-11",
        "/reports/2026-10",
        "/reports/2026-09",
        "/reports/2026-08",
        "/reports/2026-07",
      ]) {
        await expect(page.locator(`a[href="${monthHref}"]`)).toBeVisible();
      }

      // Edit baseline dates -> Save -> Reload -> Verify -> Reset
      await page.locator("#baseline-start").fill("2026-08-01");
      await page.locator("#baseline-end").fill("2026-08-14");
      await page.getByRole("button", { name: "حفظ فترة الأساس" }).click();
      await expect(page.getByText("مخصّص: من 2026-08-01 إلى 2026-08-14")).toBeVisible({
        timeout: 10_000,
      });

      await page.reload();
      await expect(page.locator("#baseline-start")).toHaveValue("2026-08-01");
      await expect(page.locator("#baseline-end")).toHaveValue("2026-08-14");

      await page.getByRole("button", { name: "استعادة أول 14 يوماً" }).click();
      await expect(page.getByText("تلقائي: أول 14 يوماً")).toBeVisible({
        timeout: 10_000,
      });

      // Restore exact original baseline before opening report pages
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: {
          baselineStart: restaurant.baselineStart,
          baselineEnd: restaurant.baselineEnd,
        },
      });

      // Open 2026-08 Arabic report (volume-adjusted positive savings)
      await page.goto("/reports/2026-08");
      await expect(page.getByText("تقدير", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("الوفر الشهري التقديري")).toBeVisible();
      await expect(page.getByText("كيف حسبنا هذا الرقم؟")).toBeVisible();
      await expect(page.getByText("3 إجراءات مقترحة للشهر القادم")).toBeVisible();
      await expect(page.locator("ol li")).toHaveCount(3);

      // CSV export check (authenticated cookie shared by page.request)
      const csvRes = await page.request.get("/api/reports/2026-08/csv?locale=ar");
      expect(csvRes.status()).toBe(200);
      expect(csvRes.headers()["content-type"]).toContain("text/csv");
      const csvText = await csvRes.text();
      expect(csvText).toContain("التاريخ");
      expect(csvText).toContain("2026-08-01");

      // Open 2026-11 report in Arabic -> negative savings wording
      await page.goto("/reports/2026-11");
      await expect(page.getByText("ارتفع الهدر بمقدار")).toBeVisible();

      // Switch to English LTR and verify both 2026-11 and 2026-08
      await page.getByTestId("language-switcher").click();
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr", {
        timeout: 10_000,
      });
      await expect(page.getByText("ESTIMATE", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Waste increased by")).toBeVisible();
      await expect(page.getByText("How we calculated this")).toBeVisible();
      await expect(page.getByText("3 Plain-Language Suggested Actions")).toBeVisible();

      await page.goto("/reports/2026-08");
      await expect(page.getByText("Estimated Monthly Savings")).toBeVisible();
      await expect(page.getByText("Volume-adjusted (SAR per unit sold)")).toBeVisible();

      expect(runtimeErrors).toEqual([]);
    } finally {
      await prisma.user.update({
        where: { id: manager.id },
        data: { locale: manager.locale },
      });
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: {
          baselineStart: restaurant.baselineStart,
          baselineEnd: restaurant.baselineEnd,
        },
      });
      await prisma.auditLog.deleteMany({
        where: {
          tenantId: restaurant.id,
          action: "BASELINE_UPDATED",
          entity: "Restaurant",
        },
      });
      await prisma.$disconnect();
    }
  });
});
