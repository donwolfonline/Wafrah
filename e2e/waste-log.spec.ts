import { expect, test } from "@playwright/test";

test.describe("Kitchen Waste Log (/log) — 4-tap entry & offline IndexedDB sync", () => {
  test("logs an entry in 4 taps, then queues 2 entries offline and syncs both exactly once when online", async ({
    page,
    context,
  }) => {
    const syncedClientIds: string[] = [];
    const hydrationErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (
          text.includes("Hydration failed") ||
          text.includes("hydration-mismatch") ||
          text.includes("didn't match the client")
        ) {
          hydrationErrors.push(text);
        }
      }
    });

    page.on("pageerror", (err) => {
      if (
        err.message.includes("Hydration failed") ||
        err.message.includes("hydration-mismatch") ||
        err.message.includes("didn't match the client")
      ) {
        hydrationErrors.push(err.message);
      }
    });

    page.on("response", async (response) => {
      if (
        response.url().includes("/api/waste-entries") &&
        response.request().method() === "POST" &&
        response.ok()
      ) {
        try {
          const body = (await response.json()) as {
            entry?: { clientId?: string };
          };
          if (body.entry?.clientId) {
            syncedClientIds.push(body.entry.clientId);
          }
        } catch {
          // Ignore non-JSON
        }
      }
    });

    // Sign in as Kitchen Staff (SHAMI-JED / ahmed / 1234)
    await page.goto("/login");
    await page.getByRole("tab", { name: /طاقم المطبخ|Kitchen staff/i }).click();
    await page.locator("#staff-restaurant-code").fill("SHAMI-JED");
    await page.locator("#staff-username").fill("ahmed");
    await page.locator("#staff-pin").fill("1234");
    await page.locator('form button[type="submit"]').click();

    await page.waitForURL("**/log");
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("waste-step-1")).toBeVisible();
    expect(hydrationErrors).toEqual([]);

    // Measure taps from opening /log to a saved entry
    let tapCount = 0;

    // Tap 1: Pick item
    const itemButtons = page.getByTestId("waste-item-grid").locator("button");
    await itemButtons.nth(0).click();
    tapCount += 1;

    // Tap 2: Enter quantity via quick-add (+1)
    await page.getByTestId("quick-add-1").click();
    tapCount += 1;

    // Tap 3: Pick reason chip
    await page.getByTestId("reason-chip-EXPIRED").click();
    tapCount += 1;

    // Tap 4: Tap Save
    await page.getByTestId("waste-save-button").click();
    tapCount += 1;

    expect(tapCount).toBeLessThanOrEqual(4);

    // Returns immediately to Step 1 and shows 10-second Undo banner
    await expect(page.getByTestId("waste-step-1")).toBeVisible();
    await expect(page.getByTestId("waste-undo-banner")).toBeVisible();
    await expect(page.getByTestId("waste-undo-button")).toBeVisible();

    // Wait for the online entry to finish syncing
    await expect
      .poll(() => syncedClientIds.length, { timeout: 10_000 })
      .toBe(1);
    const onlineClientId = syncedClientIds[0]!;

    // Simulate offline mode
    await context.setOffline(true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
    });
    await expect(page.getByTestId("waste-offline-badge")).toBeVisible();

    // Offline Entry 1
    await itemButtons.nth(0).click();
    await page.getByTestId("quick-add-0.5").click();
    await page.getByTestId("reason-chip-OVER_PREPARATION").click();
    await page.getByTestId("waste-save-button").click();

    await expect(page.getByTestId("waste-sync-pending")).toBeVisible();
    await expect(page.getByTestId("waste-sync-pending")).toContainText("1");

    // Offline Entry 2
    await itemButtons.nth(1).click();
    await page.getByTestId("quick-add-5").click();
    await page.getByTestId("reason-chip-DAMAGED_IN_PREP").click();
    await page.getByTestId("waste-save-button").click();

    await expect(page.getByTestId("waste-sync-pending")).toContainText("2");

    // Go back online and verify both queued entries sync exactly once
    await context.setOffline(false);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
    });

    await expect(page.getByTestId("waste-sync-pending")).toBeHidden({
      timeout: 10_000,
    });

    expect(syncedClientIds.length).toBe(3);
    const offlineSyncedIds = syncedClientIds.filter(
      (id) => id !== onlineClientId,
    );
    expect(offlineSyncedIds.length).toBe(2);
    expect(new Set(offlineSyncedIds).size).toBe(2);
  });
});
