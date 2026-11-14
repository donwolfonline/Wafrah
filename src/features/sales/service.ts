import { type ImportType, type Prisma } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import { requireRole, type SessionUser } from "@/lib/authz";
import { getTenantDb } from "@/lib/tenant";
import { ImportInputError } from "./import-files";
import {
  buildRecordUniqueKey,
  evaluateImportPreview,
  resolveColumnMapping,
} from "./preview";
import {
  fetchExistingKeys,
  parseSavedMapping,
  serializeHistory,
  serializeMenuOptions,
  stampDbDuplicates,
  upsertCommittedRows,
} from "./repository";
import {
  ConfirmImportRequestSchema,
  type ImportsBootstrapDto,
  ParseJsonRequestSchema,
  type PreviewValidRow,
  type SavedMappingsByType,
} from "./schemas";

export {
  buildImportTemplateCsv,
  ImportInputError,
  parseUploadedMatrix,
} from "./import-files";

const MENU_ITEM_SELECT = {
  id: true,
  code: true,
  name: true,
  nameAr: true,
  unit: true,
  salesUnitFactor: true,
  active: true,
} as const;

export async function getImportsBootstrapForTenant(
  sessionUserOverride?: SessionUser | null,
): Promise<ImportsBootstrapDto> {
  const user = await requireRole("sales.import", sessionUserOverride);
  const db = await getTenantDb(user);

  const [menuRows, mappingRows, historyRows] = await Promise.all([
    db.menuItem.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: MENU_ITEM_SELECT,
    }),
    db.importColumnMapping.findMany({
      select: { type: true, mapping: true },
    }),
    db.importBatch.findMany({
      take: 25,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        fileName: true,
        rowsImported: true,
        rowsRejected: true,
        rowsDuplicate: true,
        createdAt: true,
        uploadedBy: { select: { name: true, username: true } },
      },
    }),
  ]);

  const savedMappings: SavedMappingsByType = { SALES: null, PURCHASES: null };
  for (const row of mappingRows) {
    savedMappings[row.type] = parseSavedMapping(row.mapping);
  }

  return {
    menuItems: serializeMenuOptions(menuRows),
    savedMappings,
    history: serializeHistory(historyRows),
  };
}

export async function previewImportForTenant(
  rawInput: unknown,
  sessionUserOverride?: SessionUser | null,
) {
  const user = await requireRole("sales.import", sessionUserOverride);
  const input = ParseJsonRequestSchema.parse(rawInput);
  const db = await getTenantDb(user);

  const [menuRows, savedRow] = await Promise.all([
    db.menuItem.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: MENU_ITEM_SELECT,
    }),
    db.importColumnMapping.findFirst({
      where: { type: input.type },
      select: { mapping: true },
    }),
  ]);

  const savedMapping = parseSavedMapping(savedRow?.mapping);
  const mapping = resolveColumnMapping(
    input.headers,
    input.type,
    savedMapping,
    input.mapping ?? null,
  );

  const initialPreview = evaluateImportPreview({
    type: input.type,
    headers: input.headers,
    rawRows: input.rawRows,
    mapping,
    menuItems: serializeMenuOptions(menuRows),
    itemOverrides: input.itemOverrides,
  });

  const existingKeys = await fetchExistingKeys(
    db,
    input.type,
    initialPreview.validRows,
  );
  const preview = stampDbDuplicates(initialPreview, input.type, existingKeys);

  return {
    type: input.type,
    fileName: input.fileName,
    headers: input.headers,
    rawRows: input.rawRows,
    delimiter: input.delimiter,
    mapping,
    hasSavedMapping: savedMapping !== null,
    preview,
  };
}

function deduplicateValidRows(
  type: ImportType,
  validRows: PreviewValidRow[],
): PreviewValidRow[] {
  const byKey = new Map<string, PreviewValidRow>();
  for (const row of validRows) {
    const key = buildRecordUniqueKey(
      type,
      row.menuItemId,
      row.dateKey,
      row.channel,
    );
    byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

export async function confirmImportForTenant(
  rawInput: unknown,
  sessionUserOverride?: SessionUser | null,
) {
  const user = await requireRole("sales.import", sessionUserOverride);
  const input = ConfirmImportRequestSchema.parse(rawInput);
  const db = await getTenantDb(user);
  const tenantId = user.tenantId!;

  const menuRows = await db.menuItem.findMany({ select: MENU_ITEM_SELECT });

  const initialPreview = evaluateImportPreview({
    type: input.type,
    headers: input.headers,
    rawRows: input.rawRows,
    mapping: input.mapping,
    menuItems: serializeMenuOptions(menuRows),
    itemOverrides: input.itemOverrides,
  });

  const existingKeys = await fetchExistingKeys(
    db,
    input.type,
    initialPreview.validRows,
  );
  const preview = stampDbDuplicates(initialPreview, input.type, existingKeys);

  if (preview.missingRequiredFields.length > 0) {
    throw new ImportInputError("Missing required mapped columns", 400);
  }
  if (preview.overRejectionThreshold) {
    throw new ImportInputError(
      "More than 50% of rows are invalid; import rejected",
      400,
    );
  }
  if (preview.validRows.length === 0) {
    throw new ImportInputError("No valid rows available to import", 400);
  }

  const dedupedRows = deduplicateValidRows(input.type, preview.validRows);

  await db.importColumnMapping.upsert({
    where: { tenantId_type: { tenantId, type: input.type } },
    create: {
      tenantId,
      type: input.type,
      mapping: input.mapping as Prisma.InputJsonObject,
    },
    update: {
      mapping: input.mapping as Prisma.InputJsonObject,
    },
  });

  await upsertCommittedRows(db, tenantId, input.type, dedupedRows);

  const batch = await db.importBatch.create({
    data: {
      tenantId,
      uploadedById: user.userId,
      type: input.type,
      fileName: input.fileName,
      rowsImported: dedupedRows.length,
      rowsRejected: preview.rejectedCount,
      rowsDuplicate: preview.duplicatesDetected,
    },
    select: {
      id: true,
      type: true,
      fileName: true,
      rowsImported: true,
      rowsRejected: true,
      rowsDuplicate: true,
      createdAt: true,
      uploadedBy: { select: { name: true, username: true } },
    },
  });

  await recordAuditLog({
    tenantId,
    userId: user.userId,
    action: "IMPORT_COMMITTED",
    entity: "ImportBatch",
    entityId: batch.id,
    metadata: {
      type: input.type,
      fileName: input.fileName,
      rowsImported: dedupedRows.length,
      rowsRejected: preview.rejectedCount,
      rowsDuplicate: preview.duplicatesDetected,
    },
  });

  return {
    batch: serializeHistory([batch])[0]!,
    savedMapping: input.mapping,
  };
}
