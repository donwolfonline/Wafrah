import { PrismaClient } from "@prisma/client";
import { expect, type Page, test } from "@playwright/test";

function collectRuntimeErrors(page: Page, errors: string[]) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
}

test.describe("Pilot lead capture (#pilot-form) & /admin Leads tab", () => {
  test("submits Arabic & English pilot forms on 375px mobile, verifies dev emails, and manages leads in /admin", async ({
    browser,
  }) => {
    const prisma = new PrismaClient();
    const suffix = String(Math.floor(100000 + Math.random() * 899999));
    const arPhoneLocal = `0551${suffix}`;
    const arPhoneNormalized = `+966551${suffix}`;
    const enPhoneIntl = `+966552${suffix}`;
    const arBusiness = `مطعم الضيافة ${suffix}`;
    const enBusiness = `Red Sea Kitchen ${suffix}`;
    const runtimeErrors: string[] = [];

    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const adminContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    try {
      // 1) Arabic mobile 375px submission (/?utm_source=e2e_ar...)
      const arPage = await mobileContext.newPage();
      collectRuntimeErrors(arPage, runtimeErrors);
      await arPage.goto(
        "/?utm_source=e2e_qa&utm_medium=mobile&utm_campaign=pilot_ar",
        { waitUntil: "networkidle" },
      );

      await expect(arPage.locator("html")).toHaveAttribute("dir", "rtl");
      const arForm = arPage.locator("#pilot-form");
      await arForm.scrollIntoViewIfNeeded();

      // Verify empty submit catches inline client validation cleanly
      await arForm.locator('button[type="submit"]').click();
      await expect(arPage.locator("#lead-name-error")).toBeVisible();
      await expect(arPage.locator("#lead-consent-error")).toBeVisible();

      // Wait >3s from page mount to pass server anti-spam min time check
      await arPage.waitForTimeout(3200);

      await arPage.locator("#lead-name").fill("فهد القرشي");
      await arPage.locator("#lead-role").fill("مالك المطعم");
      await arPage.locator("#lead-business").fill(arBusiness);
      await arPage.getByTestId("lead-city-JEDDAH").click();
      await arPage.locator("#lead-phone").fill(arPhoneLocal);
      await arPage.locator("#lead-branches").fill("2");
      await arPage.locator("#lead-email").fill(`fahad.${suffix}@example.sa`);
      await arPage.getByTestId("lead-pos-FOODICS").click();
      await arPage.locator("#lead-consent").check();

      // Check zero horizontal overflow on 375px before submit
      const arOverflow = await arPage.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(arOverflow.scrollWidth).toBeLessThanOrEqual(arOverflow.innerWidth);

      const arResponsePromise = arPage.waitForResponse(
        (res) => res.url().includes("/api/leads") && res.request().method() === "POST",
      );
      await arForm.locator('button[type="submit"]').click();
      const arResponse = await arResponsePromise;
      expect(arResponse.status()).toBe(201);

      const arSuccess = arPage.locator("#pilot-form-success");
      await expect(arSuccess).toBeVisible();
      await expect(arSuccess).toContainText("تم استلام طلبك، سنتواصل معك خلال يوم عمل");

      // 2) English mobile 375px submission (/en?utm_source=e2e_en...) with OTHER city
      const enPage = await mobileContext.newPage();
      collectRuntimeErrors(enPage, runtimeErrors);
      await enPage.goto(
        "/en?utm_source=e2e_qa&utm_medium=mobile&utm_campaign=pilot_en",
        { waitUntil: "networkidle" },
      );

      await expect(enPage.locator("html")).toHaveAttribute("dir", "ltr");
      const enForm = enPage.locator("#pilot-form");
      await enForm.scrollIntoViewIfNeeded();
      await enPage.waitForTimeout(3200);

      await enPage.locator("#lead-name").fill("Tariq Al-Sulaiman");
      await enPage.locator("#lead-role").fill("Operations Director");
      await enPage.locator("#lead-business").fill(enBusiness);
      await enPage.getByTestId("lead-city-OTHER").click();
      await expect(enPage.locator("#lead-city-other")).toBeVisible();
      await enPage.locator("#lead-city-other").fill("Taif");
      await enPage.locator("#lead-phone").fill(enPhoneIntl);
      await enPage.locator("#lead-branches").fill("6");
      await enPage.locator("#lead-email").fill(`tariq.${suffix}@example.sa`);
      await enPage.getByTestId("lead-pos-MARN").click();
      await enPage.locator("#lead-consent").check();

      const enOverflow = await enPage.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(enOverflow.scrollWidth).toBeLessThanOrEqual(enOverflow.innerWidth);

      const enResponsePromise = enPage.waitForResponse(
        (res) => res.url().includes("/api/leads") && res.request().method() === "POST",
      );
      await enForm.locator('button[type="submit"]').click();
      const enResponse = await enResponsePromise;
      expect(enResponse.status()).toBe(201);

      const enSuccess = enPage.locator("#pilot-form-success");
      await expect(enSuccess).toBeVisible();
      await expect(enSuccess).toContainText(
        "Request received. We'll contact you within one business day",
      );

      // Verify both normalized records exist in PostgreSQL
      const savedLeads = await prisma.lead.findMany({
        where: { phone: { in: [arPhoneNormalized, enPhoneIntl] } },
      });
      expect(savedLeads).toHaveLength(2);
      const arRow = savedLeads.find((l) => l.phone === arPhoneNormalized)!;
      const enRow = savedLeads.find((l) => l.phone === enPhoneIntl)!;
      expect(arRow.utmCampaign).toBe("pilot_ar");
      expect(enRow.cityOther).toBe("Taif");
      expect(enRow.utmCampaign).toBe("pilot_en");

      // 3) Sign in to /admin as PLATFORM_ADMIN and manage leads
      const adminPage = await adminContext.newPage();
      collectRuntimeErrors(adminPage, runtimeErrors);
      await adminPage.goto("/login");
      await adminPage.locator("#manager-email").fill("admin@wafrah.sa");
      await adminPage.locator("#manager-password").fill("WafrahAdmin!2026");
      await adminPage.locator('form button[type="submit"]').click();
      await adminPage.waitForURL("**/admin**");

      await adminPage.getByTestId("tab-leads").click();
      await expect(adminPage.getByTestId(`lead-row-${arRow.id}`)).toBeVisible();
      await expect(adminPage.getByTestId(`lead-row-${enRow.id}`)).toBeVisible();

      await adminPage.getByTestId(`lead-notes-${enRow.id}`).fill("Call on Sunday 10am");
      await adminPage
        .getByTestId(`lead-row-${enRow.id}`)
        .getByRole("button")
        .click();

      await expect
        .poll(
          async () =>
            (await prisma.lead.findUnique({ where: { id: enRow.id } }))?.notes,
        )
        .toBe("Call on Sunday 10am");

      expect(runtimeErrors).toEqual([]);
    } finally {
      await prisma.auditLog.deleteMany({
        where: {
          entity: "Lead",
          action: "ADMIN_LEAD_STATUS_UPDATED",
          createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
        },
      });
      await prisma.lead.deleteMany({
        where: { phone: { in: [arPhoneNormalized, enPhoneIntl] } },
      });
      await prisma.$disconnect();
      await mobileContext.close();
      await adminContext.close();
    }
  });
});
