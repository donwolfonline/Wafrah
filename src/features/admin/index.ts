export {
  ADOPTION_WINDOW_DAYS,
  type AdoptionTenantDescriptor,
  buildTenantAdoptionRows,
  NO_ENTRIES_FLAG_DAYS,
  type RawTenantDailyEntryRow,
} from "./adoption-math";
export { AdminConsole } from "./components/admin-console";
export {
  buildRestaurantCodeCandidate,
  deriveManagerUsername,
  generateTemporaryPassword,
  resolveCityCode,
} from "./credentials";
export {
  deleteAdminRestaurant,
  type DeleteRestaurantResult,
} from "./deletion";
export { getTenantDiagnostics } from "./diagnostics";
export {
  aggregateTenantWape,
  buildDailyWasteSeries,
  HEALTH_DAILY_WINDOW_DAYS,
  summarizeCronJobLogs,
  WAPE_ALERT_THRESHOLD_PCT,
} from "./health-math";
export {
  handleAdminDiagnosticsGet,
  handleAdminOverviewGet,
  handleAdminRestaurantDelete,
  handleAdminRestaurantsPost,
  handleAdminSubscriptionPatch,
  handleAdminSuspendPost,
} from "./http";
export {
  createAdminRestaurant,
  type CreateRestaurantOptions,
} from "./mutations";
export { getAdminOverview } from "./queries";
export {
  AdminServiceError,
  type CreateRestaurantInput,
  createRestaurantSchema,
  type DeleteRestaurantInput,
  deleteRestaurantSchema,
  parseRenewDateInput,
  restaurantIdSchema,
  SubscriptionPlanEnum,
  SubscriptionStatusEnum,
  type SuspendRestaurantInput,
  suspendRestaurantSchema,
  type UpdateSubscriptionInput,
  updateSubscriptionSchema,
} from "./schemas";
export {
  setRestaurantSuspension,
  updateAdminSubscription,
} from "./subscription-mutations";
export type {
  AdminCustomerSummary,
  AdminFeedbackItem,
  AdminHealthSnapshot,
  AdminOverviewDto,
  CreateRestaurantResult,
  CronJobKey,
  CronJobRunSummary,
  CronRunStatus,
  DailyPlatformWastePoint,
  DailyTenantEntriesPoint,
  DiagnosticAlertSummary,
  DiagnosticImportSummary,
  TenantAdoptionRow,
  TenantDiagnosticsCounts,
  TenantDiagnosticsDto,
  TenantWapeSummary,
} from "./types";
