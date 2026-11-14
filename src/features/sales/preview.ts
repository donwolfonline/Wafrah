import type { ImportType, SalesChannel } from "@prisma/client";
import { escapeCsvCell } from "./csv-parser";
import type {
  ColumnMapping,
  ImportPreviewResult,
  PreviewRejectedRow,
  PreviewValidRow,
  RejectionReasonCode,
  TenantMenuItemOption,
  UnmatchedItemGroup,
} from "./schemas";
import {
  formatUtcDateKey,
  normalizeMatchText,
  parseFlexibleDate,
  parseNonNegativeDecimal,
  parseSalesChannel,
} from "./value-parsers";

export { COLUMN_UNMAPPED_VALUE, resolveColumnMapping } from "./column-mapping";
export const UNMATCHED_SKIP_VALUE = "__SKIP__";

interface MenuItemLookup {
  byId: Map<string, TenantMenuItemOption>;
  byCode: Map<string, TenantMenuItemOption>;
  byName: Map<string, TenantMenuItemOption>;
}

function buildMenuLookup(items: TenantMenuItemOption[]): MenuItemLookup {
  const byId = new Map<string, TenantMenuItemOption>();
  const byCode = new Map<string, TenantMenuItemOption>();
  const byName = new Map<string, TenantMenuItemOption>();
  const ordered = [...items].sort(
    (a, b) => Number(b.active) - Number(a.active),
  );

  for (const item of ordered) {
    byId.set(item.id, item);
    if (item.code && item.code.trim()) {
      const codeKey = item.code.trim().toLowerCase();
      if (!byCode.has(codeKey)) byCode.set(codeKey, item);
    }
    const enNorm = normalizeMatchText(item.name);
    if (enNorm && !byName.has(enNorm)) byName.set(enNorm, item);
    const arNorm = normalizeMatchText(item.nameAr);
    if (arNorm && !byName.has(arNorm)) byName.set(arNorm, item);
  }
  return { byId, byCode, byName };
}

export function buildRecordUniqueKey(
  type: ImportType,
  menuItemId: string,
  dateKey: string,
  channel: SalesChannel | null,
): string {
  return type === "SALES"
    ? `${menuItemId}|${dateKey}|${channel ?? "UNSPECIFIED"}`
    : `${menuItemId}|${dateKey}`;
}

export function evaluateImportPreview(params: {
  type: ImportType;
  headers: string[];
  rawRows: string[][];
  mapping: ColumnMapping;
  menuItems: TenantMenuItemOption[];
  itemOverrides?: Record<string, string>;
  existingKeys?: Set<string>;
}): ImportPreviewResult {
  const {
    type,
    headers,
    rawRows,
    mapping,
    menuItems,
    itemOverrides = {},
    existingKeys = new Set<string>(),
  } = params;

  const missingRequiredFields: Array<"date" | "item" | "quantity"> = [];
  if (!mapping.date) missingRequiredFields.push("date");
  if (!mapping.item) missingRequiredFields.push("item");
  if (!mapping.quantity) missingRequiredFields.push("quantity");

  if (missingRequiredFields.length > 0 || rawRows.length === 0) {
    return {
      totalRows: rawRows.length,
      validCount: 0,
      rejectedCount: 0,
      duplicateInFileCount: 0,
      duplicateInDbCount: 0,
      duplicatesDetected: 0,
      overRejectionThreshold: false,
      missingRequiredFields,
      canConfirm: false,
      validRows: [],
      rejectedRows: [],
      unmatchedItems: [],
      rejectedCsv: "",
    };
  }

  const extraHeader = type === "SALES" ? mapping.channel : mapping.cost;
  const colIdx = {
    date: headers.indexOf(mapping.date ?? ""),
    item: headers.indexOf(mapping.item ?? ""),
    quantity: headers.indexOf(mapping.quantity ?? ""),
    extra: extraHeader ? headers.indexOf(extraHeader) : -1,
  };

  const lookup = buildMenuLookup(menuItems);
  const validRows: PreviewValidRow[] = [];
  const rejectedRows: PreviewRejectedRow[] = [];
  const rejectedCsvLines: string[] = [
    `\uFEFF${[...headers, "rejection_reasons"].map(escapeCsvCell).join(",")}`,
  ];
  const unmatchedMap = new Map<string, number>();
  const seenInFile = new Set<string>();
  let duplicateInFileCount = 0;
  let duplicateInDbCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i] ?? [];
    const rowNumber = i + 2;
    const rawDate = (colIdx.date >= 0 ? row[colIdx.date] : "") ?? "";
    const rawItem = (colIdx.item >= 0 ? row[colIdx.item] : "") ?? "";
    const rawQty = (colIdx.quantity >= 0 ? row[colIdx.quantity] : "") ?? "";
    const rawExtra = (colIdx.extra >= 0 ? row[colIdx.extra] : "") ?? "";
    const reasons: RejectionReasonCode[] = [];

    const parsedDate = parseFlexibleDate(rawDate);
    if (!rawDate.trim()) reasons.push("missingDate");
    else if (!parsedDate) reasons.push("badDate");

    const trimmedItem = rawItem.trim();
    let matchedItem: TenantMenuItemOption | undefined;
    if (!trimmedItem) {
      reasons.push("missingItem");
    } else {
      const overrideTarget = itemOverrides[trimmedItem];
      if (overrideTarget && overrideTarget !== UNMATCHED_SKIP_VALUE) {
        matchedItem = lookup.byId.get(overrideTarget);
      } else if (overrideTarget !== UNMATCHED_SKIP_VALUE) {
        matchedItem =
          lookup.byCode.get(trimmedItem.toLowerCase()) ??
          lookup.byId.get(trimmedItem) ??
          lookup.byName.get(normalizeMatchText(trimmedItem));
      }
      if (!matchedItem) {
        reasons.push("unknownItem");
        unmatchedMap.set(trimmedItem, (unmatchedMap.get(trimmedItem) ?? 0) + 1);
      }
    }

    let parsedQtyString = "";
    if (!rawQty.trim()) {
      reasons.push("missingQuantity");
    } else {
      const qtyResult = parseNonNegativeDecimal(rawQty);
      if (!qtyResult.ok) {
        reasons.push(
          qtyResult.isNegative ? "negativeQuantity" : "invalidQuantity",
        );
      } else {
        parsedQtyString = qtyResult.value.toString();
      }
    }

    let channelValue: SalesChannel | null = null;
    let costValue: string | null = null;
    if (type === "SALES") {
      channelValue = parseSalesChannel(rawExtra);
      if (channelValue === null) reasons.push("invalidChannel");
    } else if (rawExtra.trim()) {
      const costResult = parseNonNegativeDecimal(rawExtra);
      if (!costResult.ok) {
        reasons.push(costResult.isNegative ? "negativeCost" : "invalidCost");
      } else {
        costValue = costResult.value.toString();
      }
    }

    if (reasons.length > 0 || !parsedDate || !matchedItem) {
      rejectedRows.push({
        rowNumber,
        rawDate,
        rawItem,
        rawQuantity: rawQty,
        rawExtra,
        reasons,
      });
      const padded = headers.map((_, hIdx) => row[hIdx] ?? "");
      rejectedCsvLines.push(
        [...padded, reasons.join("; ")].map(escapeCsvCell).join(","),
      );
      continue;
    }

    const dateKey = formatUtcDateKey(parsedDate);
    const uniqueKey = buildRecordUniqueKey(
      type,
      matchedItem.id,
      dateKey,
      channelValue,
    );
    const isDuplicateInFile = seenInFile.has(uniqueKey);
    if (isDuplicateInFile) duplicateInFileCount++;
    else seenInFile.add(uniqueKey);

    const isExistingInDb = existingKeys.has(uniqueKey);
    if (isExistingInDb && !isDuplicateInFile) duplicateInDbCount++;

    validRows.push({
      rowNumber,
      dateKey,
      menuItemId: matchedItem.id,
      itemCode: matchedItem.code,
      itemName: matchedItem.name,
      itemNameAr: matchedItem.nameAr,
      rawItem: trimmedItem,
      quantity: parsedQtyString,
      channel: channelValue,
      cost: costValue,
      isDuplicateInFile,
      isExistingInDb,
    });
  }

  const unmatchedItems: UnmatchedItemGroup[] = Array.from(
    unmatchedMap.entries(),
  ).map(([rawName, rowCount]) => ({
    rawName,
    rowCount,
    selectedAction: itemOverrides[rawName] ?? "",
  }));

  const totalRows = rawRows.length;
  const overRejectionThreshold =
    totalRows > 0 && rejectedRows.length * 2 > totalRows;

  return {
    totalRows,
    validCount: validRows.length,
    rejectedCount: rejectedRows.length,
    duplicateInFileCount,
    duplicateInDbCount,
    duplicatesDetected: duplicateInFileCount + duplicateInDbCount,
    overRejectionThreshold,
    missingRequiredFields,
    canConfirm:
      validRows.length > 0 &&
      !overRejectionThreshold &&
      missingRequiredFields.length === 0,
    validRows,
    rejectedRows,
    unmatchedItems,
    rejectedCsv: rejectedRows.length > 0 ? rejectedCsvLines.join("\n") : "",
  };
}
