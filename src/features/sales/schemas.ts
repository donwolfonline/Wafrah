import { ImportType, SalesChannel } from "@prisma/client";
import { z } from "zod";

export const ImportTypeSchema = z.nativeEnum(ImportType);
export const SalesChannelSchema = z.nativeEnum(SalesChannel);

export const DelimiterSchema = z.enum([",", ";", "\t", "|"]);

export const ColumnMappingSchema = z.object({
  date: z.string().nullable(),
  item: z.string().nullable(),
  quantity: z.string().nullable(),
  channel: z.string().nullable().optional(),
  cost: z.string().nullable().optional(),
});

export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

export const ItemOverrideMapSchema = z.record(z.string(), z.string());

export const ParseJsonRequestSchema = z.object({
  type: ImportTypeSchema,
  fileName: z.string().trim().min(1).max(255),
  headers: z.array(z.string()).min(1).max(100),
  rawRows: z.array(z.array(z.string())).max(10000),
  mapping: ColumnMappingSchema.optional(),
  itemOverrides: ItemOverrideMapSchema.optional(),
  delimiter: DelimiterSchema.optional(),
});

export const ConfirmImportRequestSchema = z.object({
  type: ImportTypeSchema,
  fileName: z.string().trim().min(1).max(255),
  headers: z.array(z.string()).min(1).max(100),
  rawRows: z.array(z.array(z.string())).min(1).max(10000),
  mapping: ColumnMappingSchema,
  itemOverrides: ItemOverrideMapSchema.optional(),
});

export type RejectionReasonCode =
  | "missingDate"
  | "badDate"
  | "missingItem"
  | "unknownItem"
  | "missingQuantity"
  | "invalidQuantity"
  | "negativeQuantity"
  | "invalidChannel"
  | "invalidCost"
  | "negativeCost";

export interface PreviewValidRow {
  rowNumber: number;
  dateKey: string;
  menuItemId: string;
  itemCode: string | null;
  itemName: string;
  itemNameAr: string;
  rawItem: string;
  quantity: string;
  channel: SalesChannel | null;
  cost: string | null;
  isDuplicateInFile: boolean;
  isExistingInDb: boolean;
}

export interface PreviewRejectedRow {
  rowNumber: number;
  rawDate: string;
  rawItem: string;
  rawQuantity: string;
  rawExtra: string;
  reasons: RejectionReasonCode[];
}

export interface UnmatchedItemGroup {
  rawName: string;
  rowCount: number;
  selectedAction: string;
}

export interface ImportPreviewResult {
  totalRows: number;
  validCount: number;
  rejectedCount: number;
  duplicateInFileCount: number;
  duplicateInDbCount: number;
  duplicatesDetected: number;
  overRejectionThreshold: boolean;
  missingRequiredFields: Array<"date" | "item" | "quantity">;
  canConfirm: boolean;
  validRows: PreviewValidRow[];
  rejectedRows: PreviewRejectedRow[];
  unmatchedItems: UnmatchedItemGroup[];
  rejectedCsv: string;
}

export interface TenantMenuItemOption {
  id: string;
  code: string | null;
  name: string;
  nameAr: string;
  unit: string;
  salesUnitFactor: string;
  active: boolean;
}

export interface ImportHistoryEntryDto {
  id: string;
  type: ImportType;
  fileName: string;
  rowsImported: number;
  rowsRejected: number;
  rowsDuplicate: number;
  uploadedByName: string | null;
  createdAt: string;
}

export interface SavedMappingsByType {
  SALES: ColumnMapping | null;
  PURCHASES: ColumnMapping | null;
}

export interface ImportsBootstrapDto {
  menuItems: TenantMenuItemOption[];
  savedMappings: SavedMappingsByType;
  history: ImportHistoryEntryDto[];
}
