import { type ImportType, Prisma, type SalesChannel } from "@prisma/client";
import type { getTenantDb } from "@/lib/tenant";
import { buildRecordUniqueKey } from "./preview";
import {
  type ColumnMapping,
  ColumnMappingSchema,
  type ImportHistoryEntryDto,
  type ImportPreviewResult,
  type PreviewValidRow,
  type TenantMenuItemOption,
} from "./schemas";
import { formatUtcDateKey } from "./value-parsers";

type TenantDb = Awaited<ReturnType<typeof getTenantDb>>;

export function serializeMenuOptions(
  rows: Array<{
    id: string;
    code: string | null;
    name: string;
    nameAr: string;
    unit: string;
    salesUnitFactor: Prisma.Decimal;
    active: boolean;
  }>,
): TenantMenuItemOption[] {
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    nameAr: row.nameAr,
    unit: row.unit,
    salesUnitFactor: row.salesUnitFactor.toString(),
    active: row.active,
  }));
}

export function parseSavedMapping(
  raw: Prisma.JsonValue | null | undefined,
): ColumnMapping | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = ColumnMappingSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function serializeHistory(
  batches: Array<{
    id: string;
    type: ImportType;
    fileName: string;
    rowsImported: number;
    rowsRejected: number;
    rowsDuplicate: number;
    createdAt: Date;
    uploadedBy: { name: string | null; username: string | null } | null;
  }>,
): ImportHistoryEntryDto[] {
  return batches.map((b) => ({
    id: b.id,
    type: b.type,
    fileName: b.fileName,
    rowsImported: b.rowsImported,
    rowsRejected: b.rowsRejected,
    rowsDuplicate: b.rowsDuplicate,
    uploadedByName: b.uploadedBy?.name ?? b.uploadedBy?.username ?? null,
    createdAt: b.createdAt.toISOString(),
  }));
}

export async function fetchExistingKeys(
  db: TenantDb,
  type: ImportType,
  validRows: PreviewValidRow[],
): Promise<Set<string>> {
  const keys = new Set<string>();
  if (validRows.length === 0) return keys;

  const menuItemIds = Array.from(new Set(validRows.map((r) => r.menuItemId)));
  const uniqueDates = Array.from(new Set(validRows.map((r) => r.dateKey))).map(
    (k) => new Date(`${k}T00:00:00.000Z`),
  );

  if (type === "SALES") {
    const existing = await db.salesRecord.findMany({
      where: { menuItemId: { in: menuItemIds }, date: { in: uniqueDates } },
      select: { menuItemId: true, date: true, channel: true },
    });
    for (const row of existing) {
      keys.add(
        buildRecordUniqueKey(
          "SALES",
          row.menuItemId,
          formatUtcDateKey(row.date),
          row.channel,
        ),
      );
    }
  } else {
    const existing = await db.purchaseRecord.findMany({
      where: { menuItemId: { in: menuItemIds }, date: { in: uniqueDates } },
      select: { menuItemId: true, date: true },
    });
    for (const row of existing) {
      keys.add(
        buildRecordUniqueKey(
          "PURCHASES",
          row.menuItemId,
          formatUtcDateKey(row.date),
          null,
        ),
      );
    }
  }

  return keys;
}

export function stampDbDuplicates(
  preview: ImportPreviewResult,
  type: ImportType,
  existingKeys: Set<string>,
): ImportPreviewResult {
  if (existingKeys.size === 0 || preview.validRows.length === 0) {
    return preview;
  }

  let duplicateInDbCount = 0;
  const validRows = preview.validRows.map((row) => {
    const key = buildRecordUniqueKey(
      type,
      row.menuItemId,
      row.dateKey,
      row.channel,
    );
    const isExistingInDb = existingKeys.has(key);
    if (isExistingInDb && !row.isDuplicateInFile) {
      duplicateInDbCount++;
    }
    return { ...row, isExistingInDb };
  });

  return {
    ...preview,
    validRows,
    duplicateInDbCount,
    duplicatesDetected: preview.duplicateInFileCount + duplicateInDbCount,
  };
}

export async function upsertCommittedRows(
  db: TenantDb,
  tenantId: string,
  type: ImportType,
  dedupedRows: PreviewValidRow[],
): Promise<void> {
  if (type === "SALES") {
    for (const row of dedupedRows) {
      const date = new Date(`${row.dateKey}T00:00:00.000Z`);
      const channel: SalesChannel = row.channel ?? "UNSPECIFIED";
      const quantitySold = new Prisma.Decimal(row.quantity);
      await db.salesRecord.upsert({
        where: {
          tenantId_menuItemId_date_channel: {
            tenantId,
            menuItemId: row.menuItemId,
            date,
            channel,
          },
        },
        create: {
          tenantId,
          menuItemId: row.menuItemId,
          date,
          quantitySold,
          channel,
          source: "CSV",
        },
        update: {
          quantitySold,
          source: "CSV",
        },
      });
    }
    return;
  }

  for (const row of dedupedRows) {
    const date = new Date(`${row.dateKey}T00:00:00.000Z`);
    const quantity = new Prisma.Decimal(row.quantity);
    const cost = row.cost !== null ? new Prisma.Decimal(row.cost) : null;
    await db.purchaseRecord.upsert({
      where: {
        tenantId_menuItemId_date: {
          tenantId,
          menuItemId: row.menuItemId,
          date,
        },
      },
      create: {
        tenantId,
        menuItemId: row.menuItemId,
        date,
        quantity,
        cost,
      },
      update: {
        quantity,
        cost,
      },
    });
  }
}
