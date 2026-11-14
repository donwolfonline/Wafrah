import { buildCsvString } from "@/lib/csv";
import type { TenantExportDatasets } from "./export-tables";

function isoDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

function isoDateTime(value: Date | null | undefined): string {
  return value ? value.toISOString() : "";
}

function decCell(value: { toString(): string } | null | undefined): string {
  return value ? value.toString() : "";
}

export function serializeCoreTenantCsvEntries(
  data: TenantExportDatasets,
): Array<{ name: string; content: string }> {
  return [
    {
      name: "restaurant.csv",
      content: buildCsvString(
        [
          "id", "code", "name", "nameAr", "city", "type",
          "timezone", "shiftConfig", "baselineStart", "baselineEnd", "createdAt",
        ],
        data.restaurant.map((r) => [
          r.id, r.code, r.name, r.nameAr, r.city, r.type, r.timezone,
          r.shiftConfig ? JSON.stringify(r.shiftConfig) : "",
          isoDate(r.baselineStart), isoDate(r.baselineEnd), isoDateTime(r.createdAt),
        ]),
      ),
    },
    {
      name: "users.csv",
      content: buildCsvString(
        ["id", "tenantId", "name", "role", "email", "username", "locale", "active", "lastLoginAt", "createdAt"],
        data.users.map((u) => [
          u.id, u.tenantId, u.name, u.role, u.email, u.username,
          u.locale, u.active, isoDateTime(u.lastLoginAt), isoDateTime(u.createdAt),
        ]),
      ),
    },
    {
      name: "menu-items.csv",
      content: buildCsvString(
        [
          "id", "tenantId", "code", "name", "nameAr", "category",
          "unit", "salesUnitFactor", "unitCost", "shortageCost", "active", "createdAt",
        ],
        data.menuItems.map((m) => [
          m.id, m.tenantId, m.code, m.name, m.nameAr, m.category, m.unit,
          decCell(m.salesUnitFactor), decCell(m.unitCost), decCell(m.shortageCost),
          m.active, isoDateTime(m.createdAt),
        ]),
      ),
    },
    {
      name: "waste-entries.csv",
      content: buildCsvString(
        [
          "id", "tenantId", "menuItemId", "quantity", "reason", "shift",
          "occurredAt", "createdAt", "deletedAt", "loggedById", "clientId", "note",
        ],
        data.wasteEntries.map((w) => [
          w.id, w.tenantId, w.menuItemId, decCell(w.quantity), w.reason, w.shift,
          isoDateTime(w.occurredAt), isoDateTime(w.createdAt), isoDateTime(w.deletedAt),
          w.loggedById, w.clientId, w.note,
        ]),
      ),
    },
    {
      name: "sales-records.csv",
      content: buildCsvString(
        ["id", "tenantId", "menuItemId", "date", "quantitySold", "channel", "source"],
        data.salesRecords.map((s) => [
          s.id, s.tenantId, s.menuItemId, isoDate(s.date),
          decCell(s.quantitySold), s.channel, s.source,
        ]),
      ),
    },
    {
      name: "purchase-records.csv",
      content: buildCsvString(
        ["id", "tenantId", "menuItemId", "date", "quantity", "cost"],
        data.purchaseRecords.map((p) => [
          p.id, p.tenantId, p.menuItemId, isoDate(p.date),
          decCell(p.quantity), decCell(p.cost),
        ]),
      ),
    },
    {
      name: "events.csv",
      content: buildCsvString(
        ["id", "tenantId", "name", "nameAr", "startDate", "endDate", "demandMultiplier"],
        data.eventCalendar.map((e) => [
          e.id, e.tenantId, e.name, e.nameAr, isoDate(e.startDate),
          isoDate(e.endDate), decCell(e.demandMultiplier),
        ]),
      ),
    },
  ];
}
