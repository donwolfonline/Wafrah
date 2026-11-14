import { buildCsvString } from "@/lib/csv";
import type { TenantExportDatasets } from "./export-tables";

function isoDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

function isoDateTime(value: Date | null | undefined): string {
  return value ? value.toISOString() : "";
}

function jsonCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function decCell(value: { toString(): string } | null | undefined): string {
  return value ? value.toString() : "";
}

export function serializeOpsTenantCsvEntries(
  data: TenantExportDatasets,
): Array<{ name: string; content: string }> {
  return [
    {
      name: "forecast-results.csv",
      content: buildCsvString(
        [
          "id", "tenantId", "menuItemId", "forDate", "meanQty", "lowQty",
          "highQty", "recommendedQty", "method", "createdAt", "inputsSnapshot",
        ],
        data.forecastResults.map((f) => [
          f.id, f.tenantId, f.menuItemId, isoDate(f.forDate),
          decCell(f.meanQty), decCell(f.lowQty), decCell(f.highQty),
          decCell(f.recommendedQty), f.method, isoDateTime(f.createdAt),
          jsonCell(f.inputsSnapshot),
        ]),
      ),
    },
    {
      name: "alerts.csv",
      content: buildCsvString(
        [
          "id", "tenantId", "menuItemId", "type", "severity", "messageKey",
          "messageParams", "status", "dedupeKey", "notifiedAt", "createdAt",
        ],
        data.alerts.map((a) => [
          a.id, a.tenantId, a.menuItemId, a.type, a.severity, a.messageKey,
          jsonCell(a.messageParams), a.status, a.dedupeKey,
          isoDateTime(a.notifiedAt), isoDateTime(a.createdAt),
        ]),
      ),
    },
    {
      name: "notification-preferences.csv",
      content: buildCsvString(
        [
          "id", "tenantId", "userId", "criticalAlerts", "weeklySummary",
          "monthlyReport", "createdAt", "updatedAt",
        ],
        data.notificationPreferences.map((n) => [
          n.id, n.tenantId, n.userId, n.criticalAlerts, n.weeklySummary,
          n.monthlyReport, isoDateTime(n.createdAt), isoDateTime(n.updatedAt),
        ]),
      ),
    },
    {
      name: "subscription.csv",
      content: buildCsvString(
        ["id", "tenantId", "plan", "status", "renewsAt"],
        data.subscriptions.map((s) => [
          s.id, s.tenantId, s.plan, s.status, isoDateTime(s.renewsAt),
        ]),
      ),
    },
    {
      name: "audit-logs.csv",
      content: buildCsvString(
        ["id", "tenantId", "userId", "action", "entity", "entityId", "metadata", "createdAt"],
        data.auditLogs.map((l) => [
          l.id, l.tenantId, l.userId, l.action, l.entity, l.entityId,
          jsonCell(l.metadata), isoDateTime(l.createdAt),
        ]),
      ),
    },
    {
      name: "import-column-mappings.csv",
      content: buildCsvString(
        ["id", "tenantId", "type", "mapping", "updatedAt", "createdAt"],
        data.importColumnMappings.map((m) => [
          m.id, m.tenantId, m.type, jsonCell(m.mapping),
          isoDateTime(m.updatedAt), isoDateTime(m.createdAt),
        ]),
      ),
    },
    {
      name: "import-batches.csv",
      content: buildCsvString(
        [
          "id", "tenantId", "uploadedById", "type", "fileName",
          "rowsImported", "rowsRejected", "rowsDuplicate", "createdAt",
        ],
        data.importBatches.map((b) => [
          b.id, b.tenantId, b.uploadedById, b.type, b.fileName,
          b.rowsImported, b.rowsRejected, b.rowsDuplicate, isoDateTime(b.createdAt),
        ]),
      ),
    },
    {
      name: "feedback.csv",
      content: buildCsvString(
        ["id", "tenantId", "userId", "page", "rating", "message", "createdAt"],
        data.feedbacks.map((f) => [
          f.id, f.tenantId, f.userId, f.page, f.rating, f.message, isoDateTime(f.createdAt),
        ]),
      ),
    },
  ];
}
