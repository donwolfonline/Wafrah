import { shiftDateKey } from "@/features/insights";
import type {
  AdminCustomerSummary,
  DailyTenantEntriesPoint,
  TenantAdoptionRow,
} from "./types";

export const ADOPTION_WINDOW_DAYS = 14;
export const NO_ENTRIES_FLAG_DAYS = 3;

export interface RawTenantDailyEntryRow {
  tenantId: string;
  dateKey: string;
  entryCount: number;
}

export interface AdoptionTenantDescriptor {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  status: AdminCustomerSummary["status"];
}

function toIsoStringOrNull(
  value: Date | string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function isFlagEligibleStatus(status: AdminCustomerSummary["status"]): boolean {
  return status !== "SUSPENDED" && status !== "CANCELLED";
}

/**
 * Builds per-restaurant 14-day entry sparklines and flags active tenants that
 * have recorded zero WasteEntry rows in the last 3 Riyadh business days.
 */
export function buildTenantAdoptionRows(
  endDateKey: string,
  tenants: AdoptionTenantDescriptor[],
  dailyRows: RawTenantDailyEntryRow[],
  lastEntryByTenant: ReadonlyMap<string, Date | string>,
  lastLoginByTenant: ReadonlyMap<string, Date | string>,
  windowDays: number = ADOPTION_WINDOW_DAYS,
  flagDays: number = NO_ENTRIES_FLAG_DAYS,
): TenantAdoptionRow[] {
  const safeWindowDays = Math.max(1, windowDays);
  const safeFlagDays = Math.max(1, Math.min(safeWindowDays, flagDays));
  const windowStartDateKey = shiftDateKey(endDateKey, -(safeWindowDays - 1));

  const countByTenantAndDate = new Map<string, number>();
  for (const row of dailyRows) {
    countByTenantAndDate.set(`${row.tenantId}::${row.dateKey}`, row.entryCount);
  }

  const rows: TenantAdoptionRow[] = tenants.map((tenant) => {
    const dailySeries: DailyTenantEntriesPoint[] = [];
    let entries14d = 0;

    for (let offset = 0; offset < safeWindowDays; offset++) {
      const dateKey = shiftDateKey(windowStartDateKey, offset);
      const entryCount =
        countByTenantAndDate.get(`${tenant.id}::${dateKey}`) ?? 0;
      entries14d += entryCount;
      dailySeries.push({ dateKey, entryCount });
    }

    const recentSlice = dailySeries.slice(-safeFlagDays);
    const entriesLast3Days = recentSlice.reduce(
      (sum, point) => sum + point.entryCount,
      0,
    );

    const noEntriesIn3Days =
      isFlagEligibleStatus(tenant.status) && entriesLast3Days === 0;

    return {
      tenantId: tenant.id,
      code: tenant.code,
      name: tenant.name,
      nameAr: tenant.nameAr,
      status: tenant.status,
      entries14d,
      entriesLast3Days,
      lastEntryAt: toIsoStringOrNull(lastEntryByTenant.get(tenant.id)),
      lastLoginAt: toIsoStringOrNull(lastLoginByTenant.get(tenant.id)),
      noEntriesIn3Days,
      dailySeries,
    };
  });

  rows.sort((a, b) => {
    if (a.noEntriesIn3Days !== b.noEntriesIn3Days) {
      return a.noEntriesIn3Days ? -1 : 1;
    }
    if (a.entriesLast3Days !== b.entriesLast3Days) {
      return a.entriesLast3Days - b.entriesLast3Days;
    }
    return a.name.localeCompare(b.name);
  });

  return rows;
}
