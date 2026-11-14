import type { ImportType } from "@prisma/client";
import type { ColumnMapping } from "./schemas";
import { normalizeMatchText } from "./value-parsers";

export const COLUMN_UNMAPPED_VALUE = "__NONE__";

type LogicalField = "date" | "item" | "quantity" | "channel" | "cost";

const FIELD_HEADER_ALIASES: Record<LogicalField, string[]> = {
  date: [
    "date",
    "day",
    "sales date",
    "sale date",
    "purchase date",
    "order date",
    "business date",
    "التاريخ",
    "تاريخ",
    "تاريخ البيع",
    "تاريخ المبيعات",
    "تاريخ الشراء",
    "تاريخ الفاتوره",
    "اليوم",
  ],
  item: [
    "item",
    "itemname",
    "item name",
    "menu item",
    "menuitem",
    "product",
    "product name",
    "dish",
    "itemid",
    "item id",
    "itemcode",
    "item code",
    "sku",
    "code",
    "الصنف",
    "اسم الصنف",
    "المنتج",
    "اسم المنتج",
    "الطبق",
    "الرمز",
    "رمز الصنف",
    "كود الصنف",
    "رقم الصنف",
  ],
  quantity: [
    "quantity",
    "quantitysold",
    "quantity sold",
    "qty",
    "qty sold",
    "sold",
    "units",
    "units sold",
    "الكميه",
    "كميه",
    "الكميه المباعه",
    "كميه البيع",
    "كميه الشراء",
    "الكميه المشتراه",
    "العدد",
  ],
  channel: [
    "channel",
    "sales channel",
    "saleschannel",
    "order type",
    "source",
    "القناه",
    "قناه البيع",
    "القناة",
    "نوع الطلب",
    "المصدر",
  ],
  cost: [
    "cost",
    "total cost",
    "unit cost",
    "price",
    "total",
    "amount",
    "cost sar",
    "التكلفه",
    "التكلفه الاجماليه",
    "تكلفه",
    "السعر",
    "المبلغ",
  ],
};

function findMatchingHeader(
  headers: string[],
  candidateHeader: string | null | undefined,
): string | null {
  if (!candidateHeader || candidateHeader === COLUMN_UNMAPPED_VALUE) {
    return null;
  }
  const exact = headers.find((h) => h === candidateHeader);
  if (exact) return exact;

  const targetNorm = normalizeMatchText(candidateHeader);
  if (!targetNorm) return null;
  return headers.find((h) => normalizeMatchText(h) === targetNorm) ?? null;
}

export function resolveColumnMapping(
  headers: string[],
  type: ImportType,
  savedMapping?: Partial<ColumnMapping> | null,
  explicitMapping?: Partial<ColumnMapping> | null,
): ColumnMapping {
  const fields: LogicalField[] =
    type === "SALES"
      ? ["date", "item", "quantity", "channel"]
      : ["date", "item", "quantity", "cost"];

  const resolved: ColumnMapping = {
    date: null,
    item: null,
    quantity: null,
    channel: type === "SALES" ? null : undefined,
    cost: type === "PURCHASES" ? null : undefined,
  };
  const usedHeaders = new Set<string>();

  for (const field of fields) {
    if (explicitMapping && Object.hasOwn(explicitMapping, field)) {
      const matched = findMatchingHeader(headers, explicitMapping[field]);
      resolved[field] = matched;
      if (matched) usedHeaders.add(matched);
      continue;
    }

    const fromSaved = findMatchingHeader(headers, savedMapping?.[field]);
    if (fromSaved && !usedHeaders.has(fromSaved)) {
      resolved[field] = fromSaved;
      usedHeaders.add(fromSaved);
    }
  }

  for (const field of fields) {
    if (explicitMapping && Object.hasOwn(explicitMapping, field)) {
      continue;
    }
    if (resolved[field]) continue;

    const aliases = FIELD_HEADER_ALIASES[field].map(normalizeMatchText);
    const match = headers.find((h) => {
      if (usedHeaders.has(h)) return false;
      return aliases.includes(normalizeMatchText(h));
    });

    if (match) {
      resolved[field] = match;
      usedHeaders.add(match);
    } else {
      resolved[field] = null;
    }
  }

  return resolved;
}
