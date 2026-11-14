import type { AlertSeverity, Role } from "@prisma/client";
import type { SupportedLocale } from "@/lib/format";

export interface NotificationPreferencesDto {
  criticalAlerts: boolean;
  weeklySummary: boolean;
  monthlyReport: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface CriticalAlertEmailItem {
  id: string;
  severity: AlertSeverity;
  messageKey: string;
  messageParams: Record<string, unknown>;
  createdAtIso: string;
}

export interface CriticalAlertEmailInput {
  locale: SupportedLocale;
  restaurantName: string;
  restaurantNameAr: string;
  dateKey: string;
  alerts: CriticalAlertEmailItem[];
  appUrl: string;
}

export interface WeeklyRecommendationRow {
  itemName: string;
  itemNameAr: string;
  unit: string;
  totalRecommendedQty: string;
  dailyAvgQty: string;
}

export interface WeeklySummaryEmailInput {
  locale: SupportedLocale;
  restaurantName: string;
  restaurantNameAr: string;
  horizonStart: string;
  horizonEnd: string;
  last7dWasteSar: string;
  topRecommendations: WeeklyRecommendationRow[];
  totalForecastedItems: number;
  appUrl: string;
}

export interface MonthlyReportEmailInput {
  locale: SupportedLocale;
  restaurantName: string;
  restaurantNameAr: string;
  yearMonth: string;
  outcome: "SAVED" | "INCREASED" | "FLAT" | "CALIBRATING";
  headlineAmountSar: string;
  calibratingDaysLeft: number;
  totalWasteSar: string;
  appUrl: string;
}

export interface WelcomeEmailInput {
  locale: SupportedLocale;
  recipientName: string;
  restaurantName: string;
  restaurantNameAr: string;
  branchCode: string;
  role: Role;
  appUrl: string;
}

export interface TenantCronOutcome {
  tenantId: string;
  tenantCode: string;
  status: "OK" | "FAILED";
  emailsSent: number;
  alertsNotified?: number;
  error?: string;
}

export interface ScheduledCronSummary {
  job: "daily" | "weekly" | "monthly";
  evaluatedAt: string;
  tenantCount: number;
  tenantsSucceeded: number;
  tenantsFailed: number;
  totalEmailsSent: number;
  tenants: TenantCronOutcome[];
}
