import type { OnboardingChecklist } from "./types";

export interface OnboardingRealCounts {
  activeMenuItemsCount: number;
  activeStaffCount: number;
  salesRecordsCount: number;
  wasteEntriesCount: number;
  insightsAlertsCount: number;
  forecastsCount: number;
}

/**
 * Derives pilot restaurant onboarding progress strictly from live tenant rows
 * rather than stored boolean flags. Automatically marks complete once all five
 * milestones are satisfied so the dashboard checklist hides cleanly.
 */
export function computeOnboardingChecklist(
  counts: OnboardingRealCounts,
): OnboardingChecklist {
  const hasMenuItems = counts.activeMenuItemsCount > 0;
  const hasKitchenStaff = counts.activeStaffCount > 0;
  const hasSalesHistory = counts.salesRecordsCount > 0;
  const hasWasteEntries = counts.wasteEntriesCount > 0;
  const hasInsightsReady =
    counts.insightsAlertsCount > 0 || counts.forecastsCount > 0;

  const steps = [
    hasMenuItems,
    hasKitchenStaff,
    hasSalesHistory,
    hasWasteEntries,
    hasInsightsReady,
  ];
  const completedCount = steps.filter(Boolean).length;
  const totalCount = steps.length;
  const isComplete = completedCount === totalCount;

  return {
    isNewRestaurantEmpty: !isComplete,
    isComplete,
    completedCount,
    totalCount,
    hasMenuItems,
    hasKitchenStaff,
    hasSalesHistory,
    hasSalesOrPurchases: hasSalesHistory,
    hasWasteEntries,
    hasInsightsReady,
  };
}
