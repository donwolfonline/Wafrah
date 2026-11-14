import { describe, expect, it } from "vitest";
import { computeOnboardingChecklist } from "./onboarding";

describe("dashboard onboarding checklist progress computation", () => {
  it("reports 0/5 incomplete for a brand-new empty restaurant", () => {
    const checklist = computeOnboardingChecklist({
      activeMenuItemsCount: 0,
      activeStaffCount: 0,
      salesRecordsCount: 0,
      wasteEntriesCount: 0,
      insightsAlertsCount: 0,
      forecastsCount: 0,
    });

    expect(checklist).toEqual({
      isNewRestaurantEmpty: true,
      isComplete: false,
      completedCount: 0,
      totalCount: 5,
      hasMenuItems: false,
      hasKitchenStaff: false,
      hasSalesHistory: false,
      hasSalesOrPurchases: false,
      hasWasteEntries: false,
      hasInsightsReady: false,
    });
  });

  it("stays visible with accurate partial counts while any of the 5 steps remains incomplete", () => {
    const checklist = computeOnboardingChecklist({
      activeMenuItemsCount: 12,
      activeStaffCount: 2,
      salesRecordsCount: 0,
      wasteEntriesCount: 3,
      insightsAlertsCount: 0,
      forecastsCount: 0,
    });

    expect(checklist.completedCount).toBe(3);
    expect(checklist.totalCount).toBe(5);
    expect(checklist.hasMenuItems).toBe(true);
    expect(checklist.hasKitchenStaff).toBe(true);
    expect(checklist.hasSalesHistory).toBe(false);
    expect(checklist.hasWasteEntries).toBe(true);
    expect(checklist.hasInsightsReady).toBe(false);
    expect(checklist.isComplete).toBe(false);
    expect(checklist.isNewRestaurantEmpty).toBe(true);
  });

  it("treats insights as ready when either alerts or forecasts exist", () => {
    const viaAlert = computeOnboardingChecklist({
      activeMenuItemsCount: 1,
      activeStaffCount: 1,
      salesRecordsCount: 1,
      wasteEntriesCount: 1,
      insightsAlertsCount: 1,
      forecastsCount: 0,
    });
    expect(viaAlert.hasInsightsReady).toBe(true);
    expect(viaAlert.isComplete).toBe(true);
    expect(viaAlert.isNewRestaurantEmpty).toBe(false);

    const viaForecast = computeOnboardingChecklist({
      activeMenuItemsCount: 1,
      activeStaffCount: 1,
      salesRecordsCount: 1,
      wasteEntriesCount: 1,
      insightsAlertsCount: 0,
      forecastsCount: 7,
    });
    expect(viaForecast.hasInsightsReady).toBe(true);
    expect(viaForecast.isComplete).toBe(true);
    expect(viaForecast.completedCount).toBe(5);
  });
});
