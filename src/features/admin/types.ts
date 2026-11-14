import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  ImportType,
  Role,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";
import type { SupportedLocale } from "@/lib/format";

export interface AdminCustomerSummary {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  city: string;
  type: string;
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus | null;
  renewsAt: string | null;
  userCount: number;
  lastActivityAt: string | null;
  entriesLast7Days: number;
  createdAt: string;
}

export interface DailyPlatformWastePoint {
  dateKey: string;
  entryCount: number;
  tenantCount: number;
}

export type CronJobKey = "daily" | "weekly" | "monthly" | "forecast";

export type CronRunStatus = "OK" | "PARTIAL" | "FAILED" | "NEVER_RUN";

export interface CronJobRunSummary {
  job: CronJobKey;
  lastRunAt: string | null;
  status: CronRunStatus;
  tenantCount: number | null;
  tenantsSucceeded: number | null;
  tenantsFailed: number | null;
  totalEmailsSent: number | null;
}

export interface TenantWapeSummary {
  tenantId: string;
  code: string;
  name: string;
  nameAr: string;
  averageWapePct: number | null;
  evaluationCount: number;
  latestEvaluatedAt: string | null;
  flaggedHighWape: boolean;
}

export interface AdminHealthSnapshot {
  generatedAt: string;
  windowStartDateKey: string;
  windowEndDateKey: string;
  wapeThresholdPct: number;
  flaggedWapeCount: number;
  dailyEntries: DailyPlatformWastePoint[];
  cronJobs: CronJobRunSummary[];
  forecastAccuracy: TenantWapeSummary[];
}

export interface DailyTenantEntriesPoint {
  dateKey: string;
  entryCount: number;
}

export interface TenantAdoptionRow {
  tenantId: string;
  code: string;
  name: string;
  nameAr: string;
  status: AdminCustomerSummary["status"];
  entries14d: number;
  entriesLast3Days: number;
  lastEntryAt: string | null;
  lastLoginAt: string | null;
  noEntriesIn3Days: boolean;
  dailySeries: DailyTenantEntriesPoint[];
}

export interface AdminFeedbackItem {
  id: string;
  tenantId: string | null;
  restaurantCode: string | null;
  restaurantName: string | null;
  restaurantNameAr: string | null;
  userId: string;
  userName: string;
  username: string | null;
  userRole: string;
  page: string;
  rating: number;
  message: string;
  createdAt: string;
}

export interface AdminLeadItem {
  id: string;
  name: string;
  businessName: string;
  city: "MAKKAH" | "JEDDAH" | "OTHER";
  cityOther: string | null;
  role: string;
  phone: string;
  email: string | null;
  branches: number;
  posSystem: "FOODICS" | "MARN" | "OTHER" | "NONE";
  locale: "ar" | "en";
  consent: boolean;
  consentAt: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  status: "NEW" | "CONTACTED" | "PILOT" | "NOT_FIT";
  notes: string | null;
  createdAt: string;
}

export interface AdminOverviewDto {
  customers: AdminCustomerSummary[];
  health: AdminHealthSnapshot;
  adoption: TenantAdoptionRow[];
  feedback: AdminFeedbackItem[];
  leads: AdminLeadItem[];
}

export interface CreateRestaurantResult {
  customer: AdminCustomerSummary;
  manager: {
    id: string;
    name: string;
    email: string;
    username: string;
    locale: SupportedLocale;
    role: Role;
  };
  temporaryPassword: string;
  welcomeEmailStatus: "sent" | "failed";
}

export interface TenantDiagnosticsCounts {
  usersTotal: number;
  usersActive: number;
  menuItemsTotal: number;
  menuItemsActive: number;
  wasteEntriesCount: number;
  salesRecordsCount: number;
  purchaseRecordsCount: number;
  forecastResultsCount: number;
  alertsTotalCount: number;
  alertsUnreadCount: number;
}

export interface DiagnosticImportSummary {
  id: string;
  type: ImportType;
  fileName: string;
  rowsImported: number;
  rowsRejected: number;
  rowsDuplicate: number;
  createdAt: string;
}

export interface DiagnosticAlertSummary {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  messageKey: string;
  createdAt: string;
  notifiedAt: string | null;
}

export interface TenantDiagnosticsDto {
  tenant: {
    id: string;
    code: string;
    name: string;
    nameAr: string;
    city: string;
    type: string;
    plan: SubscriptionPlan | null;
    status: SubscriptionStatus | null;
    renewsAt: string | null;
    baselineStart: string | null;
    baselineEnd: string | null;
    createdAt: string;
  };
  counts: TenantDiagnosticsCounts;
  lastImports: DiagnosticImportSummary[];
  lastAlerts: DiagnosticAlertSummary[];
}
