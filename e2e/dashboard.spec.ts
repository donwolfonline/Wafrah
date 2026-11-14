import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test.describe("Manager Dashboard (/dashboard) — AR/EN, charts, alerts & recommendations", () => {
  test("renders KPIs, Recharts trends, heatmap, rice spike alert, and weekly Why? recommendations in AR and EN", async ({
    page,
  }) => {
    const prisma = new PrismaClient();
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { code: "SHAMI-JED" },
      select: { id: true },
    });
    const manager = await prisma.user.findUniqueOrThrow({
      where: { email: "manager@shami.sa" },
      select: { id: true, locale: true },
    });

    const initialForecasts = await prisma.forecastResult.count({
      where: {
        tenantId: restaurant.id,
        forDate: { gte: new Date("2026-11-13T00:00:00.000Z") },
      },
    });
    if (initialForecasts < 8) {
      execFileSync("pnpm", ["forecast:run", "2026-11-13"], { stdio: "pipe" });
    }

    let riceAlert = await prisma.alert.findFirst({
      where: {
        tenantId: restaurant.id,
        messageKey: "insights.alerts.wasteSpike",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    if (!riceAlert) {
      execFileSync("pnpm", ["insights:run", "2026-11-12"], { stdio: "pipe" });
      riceAlert = await prisma.alert.findFirstOrThrow({
        where: {
          tenantId: restaurant.id,
          messageKey: "insights.alerts.wasteSpike",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      });
    }

    const originalAlertStatus = riceAlert.status;
    const originalLocale = manager.locale;
    await prisma.user.update({
      where: { id: manager.id },
      data: { locale: "ar" },
    });
    await prisma.alert.update({
      where: { id: riceAlert.id },
      data: { status: "UNREAD" },
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
      const dashboardRoot = page.getByTestId("manager-dashboard");
      await expect(dashboardRoot).toBeVisible({ timeout: 15_000 });

      // Default Arabic RTL verification
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("lang", "ar");

      for (const kpiId of [
        "kpi-waste-cost",
        "kpi-waste-pct-purchases",
        "kpi-waste-entries",
        "kpi-top-reason",
      ]) {
        await expect(page.getByTestId(kpiId)).toBeVisible();
      }
      await expect(page.getByTestId("kpi-waste-cost")).toContainText("ر.س");
      await expect(page.getByTestId("kpi-waste-pct-purchases")).toContainText(
        "%",
      );

      // Recharts surfaces render with real dimensions
      for (const chartId of [
        "dashboard-trend-chart",
        "dashboard-items-chart",
      ]) {
        const svg = page
          .getByTestId(chartId)
          .locator(".recharts-wrapper > svg.recharts-surface");
        await expect(svg.first()).toBeVisible({ timeout: 10_000 });
        const box = await svg.first().boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(200);
        expect(box!.height).toBeGreaterThan(150);
      }

      // Heatmap (21 weekday x shift cells) & Ranked reasons
      await expect(
        page.getByTestId("dashboard-heatmap").getByRole("gridcell"),
      ).toHaveCount(21);
      await expect(page.getByTestId("dashboard-reasons-card")).toBeVisible();

      // Rice spike alert & mark-read flow
      const alertCard = page.getByTestId(`alert-item-${riceAlert.id}`);
      await expect(alertCard).toBeVisible();
      await expect(alertCard).toContainText("SHM-RICE");
      await expect(alertCard).toContainText("أرز بسمتي مندي");

      const patchPromise = page.waitForResponse(
        (res) =>
          res.url().includes(`/api/dashboard/alerts/${riceAlert.id}`) &&
          res.request().method() === "PATCH" &&
          res.status() === 200,
      );
      await page.getByTestId(`alert-read-btn-${riceAlert.id}`).click();
      await patchPromise;
      await expect(alertCard).toHaveAttribute("data-status", "READ");

      // Recommendations table & expandable "Why?" details
      const recsTable = page.getByTestId("dashboard-recommendations-table");
      await expect(recsTable).toBeVisible();
      await expect(recsTable).toContainText("أرز بسمتي مندي");
      const firstWhyBtn = recsTable
        .locator('button[data-testid^="rec-why-btn-"]')
        .first();
      await firstWhyBtn.click();
      await expect(
        recsTable.locator('tr[data-testid^="rec-why-detail-"]').first(),
      ).toContainText("متوسط اليوم الأسبوعي");

      // Range switch timing check (< 2s)
      const switchStart = Date.now();
      await page.getByTestId("range-btn-7").click();
      await page.waitForURL("**/dashboard?range=7");
      await expect(page.getByTestId("manager-dashboard")).toBeVisible();
      const rangeSwitchMs = Date.now() - switchStart;
      expect(rangeSwitchMs).toBeLessThan(2000);

      // Switch to English LTR & verify all sections translate cleanly
      await page.getByTestId("language-switcher").click();
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr", {
        timeout: 10_000,
      });
      await expect(page.locator("html")).toHaveAttribute("lang", "en");

      await expect(page.getByTestId("kpi-waste-cost")).toContainText("SAR");
      await expect(
        page.getByTestId(`alert-item-${riceAlert.id}`),
      ).toContainText("Waste spike on");
      await expect(
        page.getByTestId("dashboard-recommendations-table"),
      ).toContainText("Rice");

      const secondEnWhyBtn = page
        .getByTestId("dashboard-recommendations-table")
        .locator('button[data-testid^="rec-why-btn-"]')
        .nth(1);
      await secondEnWhyBtn.click();
      await expect(
        page.getByTestId("dashboard-recommendations-table"),
      ).toContainText("Weekday average");

      expect(runtimeErrors).toEqual([]);
    } finally {
      await prisma.user.update({
        where: { id: manager.id },
        data: { locale: originalLocale },
      });
      await prisma.alert.update({
        where: { id: riceAlert.id },
        data: { status: originalAlertStatus },
      });
      await prisma.auditLog.deleteMany({
        where: {
          tenantId: restaurant.id,
          entity: "Alert",
          entityId: riceAlert.id,
          action: "ALERT_READ",
        },
      });
      await prisma.$disconnect();
    }
  });
});
