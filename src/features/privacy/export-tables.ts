import { serializeCoreTenantCsvEntries } from "./export-tables-core";
import { serializeOpsTenantCsvEntries } from "./export-tables-ops";

export interface TenantExportDatasets {
  restaurant: Array<{
    id: string;
    code: string;
    name: string;
    nameAr: string;
    city: string;
    type: string;
    timezone: string;
    shiftConfig: unknown;
    baselineStart: Date | null;
    baselineEnd: Date | null;
    createdAt: Date;
  }>;
  users: Array<{
    id: string;
    tenantId: string | null;
    name: string;
    role: string;
    email: string | null;
    username: string;
    locale: string;
    active: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
  }>;
  menuItems: Array<{
    id: string;
    tenantId: string;
    code: string | null;
    name: string;
    nameAr: string;
    category: string;
    unit: string;
    salesUnitFactor: { toString(): string };
    unitCost: { toString(): string };
    shortageCost: { toString(): string } | null;
    active: boolean;
    createdAt: Date;
  }>;
  wasteEntries: Array<{
    id: string;
    tenantId: string;
    menuItemId: string;
    quantity: { toString(): string };
    reason: string;
    shift: string;
    occurredAt: Date;
    createdAt: Date;
    deletedAt: Date | null;
    loggedById: string;
    clientId: string;
    note: string | null;
  }>;
  salesRecords: Array<{
    id: string;
    tenantId: string;
    menuItemId: string;
    date: Date;
    quantitySold: { toString(): string };
    channel: string;
    source: string;
  }>;
  purchaseRecords: Array<{
    id: string;
    tenantId: string;
    menuItemId: string;
    date: Date;
    quantity: { toString(): string };
    cost: { toString(): string } | null;
  }>;
  eventCalendar: Array<{
    id: string;
    tenantId: string | null;
    name: string;
    nameAr: string;
    startDate: Date;
    endDate: Date;
    demandMultiplier: { toString(): string };
  }>;
  forecastResults: Array<{
    id: string;
    tenantId: string;
    menuItemId: string;
    forDate: Date;
    meanQty: { toString(): string };
    lowQty: { toString(): string };
    highQty: { toString(): string };
    recommendedQty: { toString(): string };
    method: string;
    createdAt: Date;
    inputsSnapshot: unknown;
  }>;
  alerts: Array<{
    id: string;
    tenantId: string;
    menuItemId: string | null;
    type: string;
    severity: string;
    messageKey: string;
    messageParams: unknown;
    status: string;
    dedupeKey: string;
    notifiedAt: Date | null;
    createdAt: Date;
  }>;
  notificationPreferences: Array<{
    id: string;
    tenantId: string;
    userId: string;
    criticalAlerts: boolean;
    weeklySummary: boolean;
    monthlyReport: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
  subscriptions: Array<{
    id: string;
    tenantId: string;
    plan: string;
    status: string;
    renewsAt: Date | null;
  }>;
  auditLogs: Array<{
    id: string;
    tenantId: string | null;
    userId: string | null;
    action: string;
    entity: string;
    entityId: string;
    metadata: unknown;
    createdAt: Date;
  }>;
  importColumnMappings: Array<{
    id: string;
    tenantId: string;
    type: string;
    mapping: unknown;
    updatedAt: Date;
    createdAt: Date;
  }>;
  importBatches: Array<{
    id: string;
    tenantId: string;
    uploadedById: string | null;
    type: string;
    fileName: string;
    rowsImported: number;
    rowsRejected: number;
    rowsDuplicate: number;
    createdAt: Date;
  }>;
  feedbacks: Array<{
    id: string;
    tenantId: string | null;
    userId: string;
    page: string;
    rating: number;
    message: string;
    createdAt: Date;
  }>;
}

export function serializeTenantExportCsvEntries(
  data: TenantExportDatasets,
): Array<{ name: string; content: string }> {
  return [
    ...serializeCoreTenantCsvEntries(data),
    ...serializeOpsTenantCsvEntries(data),
  ];
}
