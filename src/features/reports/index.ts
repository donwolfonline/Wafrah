export { buildReportDailyCsv, generateSuggestedActions } from "./action-rules";
export {
  calculateMonthlySavings,
  computeRecommendationAdherence,
  resolveBaselineWindow,
} from "./savings";
export {
  getMonthlyReportForTenant,
  listReportMonthsForTenant,
  updateRestaurantBaselineForTenant,
} from "./service";
export {
  BaselineUpdateSchema,
  parseMonthWindow,
  ReportsValidationError,
} from "./validation";
export type {
  BaselineWindow,
  DailyReportCsvRow,
  MonthlyReportData,
  PeriodRawMetrics,
  RecommendationAdherenceResult,
  ReportAlertRow,
  ReportMonthSummary,
  ReportReasonRow,
  ReportTopItemRow,
  SavingsEstimateResult,
  SavingsMethod,
  SavingsOutcome,
  SavingsPeriodSummary,
  SavingsStatus,
  SuggestedActionItem,
} from "./types";
