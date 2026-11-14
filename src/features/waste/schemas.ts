import {
  Prisma,
  type Shift,
  type Unit,
  type WasteReason,
} from "@prisma/client";
import { z } from "zod";
import type { ShiftConfig } from "./shift";

export const WASTE_REASONS = [
  "EXPIRED",
  "OVER_PREPARATION",
  "ORDER_ERROR",
  "CUSTOMER_RETURN",
  "DAMAGED_IN_PREP",
  "OTHER",
] as const satisfies readonly WasteReason[];

export const SHIFTS = [
  "MORNING",
  "EVENING",
  "NIGHT",
] as const satisfies readonly Shift[];

export const DEFAULT_MAX_QUANTITY_BY_UNIT: Record<Unit, number> = {
  KG: 500,
  LITER: 500,
  PORTION: 2000,
  PIECE: 5000,
};

export const UNDO_WINDOW_MS = 10_000;

const DECIMAL_INPUT_PATTERN = /^\d+(\.\d{1,3})?$/;

function normalizeQuantityString(val: unknown): string {
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return "";
    return String(val);
  }
  if (typeof val === "string") {
    return val.trim();
  }
  return "";
}

export const wasteQuantitySchema = z
  .union([z.string(), z.number()])
  .transform((val) => normalizeQuantityString(val))
  .refine((val) => val.length > 0 && DECIMAL_INPUT_PATTERN.test(val), {
    message: "invalidQuantity",
  })
  .refine(
    (val) => {
      try {
        const dec = new Prisma.Decimal(val);
        return dec.greaterThan(0);
      } catch {
        return false;
      }
    },
    {
      message: "quantityMustBePositive",
    },
  );

export const wasteEntryCreateSchema = z.object({
  clientId: z.string().trim().uuid("invalidClientId"),
  menuItemId: z.string().trim().min(1, "menuItemRequired"),
  quantity: wasteQuantitySchema,
  reason: z.enum(WASTE_REASONS, {
    errorMap: () => ({ message: "invalidReason" }),
  }),
  shift: z
    .enum(SHIFTS, {
      errorMap: () => ({ message: "invalidShift" }),
    })
    .optional(),
  occurredAt: z
    .string()
    .trim()
    .datetime({ offset: true, message: "invalidOccurredAt" })
    .optional(),
  note: z
    .string()
    .trim()
    .max(500, "noteTooLong")
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type WasteEntryCreateInput = z.infer<typeof wasteEntryCreateSchema>;

export const wasteEntryUndoSchema = z.object({
  clientId: z.string().trim().uuid("invalidClientId"),
});

export type WasteEntryUndoInput = z.infer<typeof wasteEntryUndoSchema>;

export type QuantityValidationResult =
  | { ok: true; decimal: Prisma.Decimal }
  | {
      ok: false;
      code:
        | "INVALID_QUANTITY"
        | "QUANTITY_MUST_BE_POSITIVE"
        | "QUANTITY_EXCEEDS_MAX";
      maxAllowed?: number;
    };

export function validateQuantityForUnit(
  quantityInput: Prisma.Decimal | number | string,
  unit: Unit,
  maxByUnit: Partial<Record<Unit, number>> = DEFAULT_MAX_QUANTITY_BY_UNIT,
): QuantityValidationResult {
  let decimal: Prisma.Decimal;
  try {
    const str =
      quantityInput instanceof Prisma.Decimal
        ? quantityInput.toString()
        : normalizeQuantityString(quantityInput);
    if (!str || !DECIMAL_INPUT_PATTERN.test(str)) {
      return { ok: false, code: "INVALID_QUANTITY" };
    }
    decimal = new Prisma.Decimal(str);
  } catch {
    return { ok: false, code: "INVALID_QUANTITY" };
  }

  if (decimal.lessThanOrEqualTo(0)) {
    return { ok: false, code: "QUANTITY_MUST_BE_POSITIVE" };
  }

  const maxAllowed = maxByUnit[unit] ?? DEFAULT_MAX_QUANTITY_BY_UNIT[unit];
  const maxDecimal = new Prisma.Decimal(maxAllowed);
  if (decimal.greaterThan(maxDecimal)) {
    return {
      ok: false,
      code: "QUANTITY_EXCEEDS_MAX",
      maxAllowed,
    };
  }

  return { ok: true, decimal };
}

export interface WasteLogMenuItemDto {
  id: string;
  code: string | null;
  name: string;
  nameAr: string;
  category: string;
  unit: Unit;
  unitCost: string;
}

export interface WasteLogBootstrapDto {
  restaurantName: string;
  restaurantNameAr: string;
  shiftConfig: ShiftConfig;
  currentShift: Shift;
  todayWasteSar: string;
  items: WasteLogMenuItemDto[];
  recentItemIds: string[];
  userItemCounts: Record<string, number>;
  maxQuantityByUnit: Record<Unit, number>;
}

export interface WasteEntryDto {
  id: string;
  clientId: string;
  menuItemId: string;
  quantity: string;
  wasteCostSar: string;
  reason: WasteReason;
  shift: Shift;
  occurredAt: string;
  createdAt: string;
  deletedAt: string | null;
  loggedById: string;
  note: string | null;
}
