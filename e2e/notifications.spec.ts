import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test.describe("Notification settings (/settings/notifications) & daily cron API", () => {
  test("renders AR RTL & EN LTR settings, persists toggle changes across reload, and protects cron endpoint", async ({
    page,
    request,
  }) => {
    const prisma = new PrismaClient();
    const manager = await prisma.user.findUniqueOrThrow({
      where: { email: "manager@shami.sa" },
      select: { id: true, locale: true },
    });
    const prevPref = await prisma.notificationPreference.findUnique({
      where: { userId: manager.id },
      select: {
        criticalAlerts: true,
        weeklySummary: true,
        monthlyReport: true,
      },
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

      await page
        .locator('a[href="/settings/notifications"]')
        .first()
        .click();
      await page.waitForURL("**/settings/notifications**");

      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("lang", "ar");
      await expect(
        page.getByRole("heading", { name: "إعدادات إشعارات البريد الإلكتروني" }),
      ).toBeVisible();

      const criticalToggle = page.getByTestId("toggle-criticalAlerts");
      const weeklyToggle = page.getByTestId("toggle-weeklySummary");
      const saveBtn = page.getByTestId("save-notification-preferences");

      const initialCritical = await criticalToggle.getAttribute("aria-checked");
      const toggledCritical = initialCritical === "true" ? "false" : "true";
      await criticalToggle.click();
      await expect(criticalToggle).toHaveAttribute(
        "aria-checked",
        toggledCritical,
      );
      await expect(saveBtn).toBeEnabled();
      const [saveResponse] = await Promise.all([
        page.waitForResponse(
          (res) =>
            res.url().includes("/api/notifications/preferences") &&
            res.request().method() === "PATCH",
        ),
        saveBtn.click(),
      ]);
      expect(saveResponse.status()).toBe(200);
      await expect(page.getByText("تم حفظ تفضيلات الإشعارات بنجاح")).toBeVisible({
        timeout: 10_000,
      });
      await expect(saveBtn).toBeDisabled({ timeout: 10_000 });

      await page.reload();
      await expect(page.getByTestId("toggle-criticalAlerts")).toHaveAttribute(
        "aria-checked",
        toggledCritical,
      );
      await expect(weeklyToggle).toHaveAttribute("aria-checked", "true");

      // Check English LTR locale rendering via the UI locale switcher
      await page.getByRole("button", { name: "Switch to English" }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr", {
        timeout: 10_000,
      });
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(
        page.getByRole("heading", { name: "Email Notification Settings" }),
      ).toBeVisible();

      // Verify cron secret guard over HTTP
      const unauthRes = await request.post("/api/cron/daily");
      expect(unauthRes.status()).toBe(401);

      expect(runtimeErrors).toEqual([]);
    } finally {
      await prisma.user.update({
        where: { id: manager.id },
        data: { locale: manager.locale },
      });
      if (prevPref) {
        await prisma.notificationPreference.updateMany({
          where: { userId: manager.id },
          data: prevPref,
        });
      } else {
        await prisma.notificationPreference.deleteMany({
          where: { userId: manager.id },
        });
      }
      await prisma.$disconnect();
    }
  });
});
