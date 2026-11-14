import { Prisma, type Unit } from "@prisma/client";
import { z } from "zod";
import { toWesternDigits } from "@/lib/format";

export const SUPPORTED_UNITS = ["KG", "LITER", "PORTION", "PIECE"] as const;

export type MenuValidationErrorCode =
  | "nameRequired"
  | "categoryRequired"
  | "invalidUnit"
  | "invalidUnitCost"
  | "invalidShortageCost";

function normalizeDecimalString(raw: unknown): string {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? String(raw) : "";
  }
  if (typeof raw === "string") {
    return toWesternDigits(raw).replace(/,/g, "").trim();
  }
  if (
    raw &&
    typeof raw === "object" &&
    "toString" in raw &&
    typeof (raw as { toString: () => string }).toString === "function"
  ) {
    return toWesternDigits((raw as { toString: () => string }).toString())
      .replace(/,/g, "")
      .trim();
  }
  return "";
}

function isValidDecimalFormat(val: string): boolean {
  return /^-?\d+(\.\d{1,4})?$/.test(val);
}

export function normalizeUnitInput(raw: unknown): Unit | null {
  if (typeof raw !== "string") {
    return null;
  }
  const cleaned = raw.trim().toUpperCase();
  if (
    cleaned === "KG" ||
    cleaned === "KILOGRAM" ||
    cleaned === "KILOGRAMS" ||
    cleaned === "كجم" ||
    cleaned === "كيلو"
  ) {
    return "KG";
  }
  if (
    cleaned === "LITER" ||
    cleaned === "LITERS" ||
    cleaned === "LITRE" ||
    cleaned === "L" ||
    cleaned === "لتر"
  ) {
    return "LITER";
  }
  if (
    cleaned === "PORTION" ||
    cleaned === "PORTIONS" ||
    cleaned === "حصة" ||
    cleaned === "حصص"
  ) {
    return "PORTION";
  }
  if (
    cleaned === "PIECE" ||
    cleaned === "PIECES" ||
    cleaned === "PC" ||
    cleaned === "PCS" ||
    cleaned === "قطعة" ||
    cleaned === "قطع"
  ) {
    return "PIECE";
  }
  return null;
}

export const menuItemInputSchema = z
  .object({
    code: z
      .string()
      .optional()
      .nullable()
      .transform((val) => {
        const trimmed = val?.trim();
        return trimmed ? trimmed.toUpperCase() : null;
      }),
    name: z
      .string()
      .optional()
      .default("")
      .transform((val) => val.trim()),
    nameAr: z
      .string()
      .optional()
      .default("")
      .transform((val) => val.trim()),
    category: z
      .string()
      .optional()
      .default("")
      .transform((val) => val.trim()),
    unit: z.unknown(),
    unitCost: z.unknown(),
    shortageCost: z.unknown().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.name.length === 0 && data.nameAr.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "nameRequired",
      });
    }

    if (data.category.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "categoryRequired",
      });
    }

    const normalizedUnit = normalizeUnitInput(data.unit);
    if (!normalizedUnit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unit"],
        message: "invalidUnit",
      });
    }

    const unitCostStr = normalizeDecimalString(data.unitCost);
    if (
      !unitCostStr ||
      !isValidDecimalFormat(unitCostStr) ||
      new Prisma.Decimal(unitCostStr).lte(0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unitCost"],
        message: "invalidUnitCost",
      });
    }

    if (
      data.shortageCost !== undefined &&
      data.shortageCost !== null &&
      String(data.shortageCost).trim() !== ""
    ) {
      const shortageStr = normalizeDecimalString(data.shortageCost);
      if (
        !shortageStr ||
        !isValidDecimalFormat(shortageStr) ||
        new Prisma.Decimal(shortageStr).lt(0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shortageCost"],
          message: "invalidShortageCost",
        });
      }
    }
  })
  .transform((data) => {
    const unit = normalizeUnitInput(data.unit)!;
    const unitCostDecimal = new Prisma.Decimal(
      normalizeDecimalString(data.unitCost),
    ).toDecimalPlaces(2);

    const hasShortage =
      data.shortageCost !== undefined &&
      data.shortageCost !== null &&
      String(data.shortageCost).trim() !== "";

    const shortageCostDecimal = hasShortage
      ? new Prisma.Decimal(
          normalizeDecimalString(data.shortageCost),
        ).toDecimalPlaces(2)
      : null;

    return {
      code: data.code ?? null,
      name: data.name,
      nameAr: data.nameAr,
      category: data.category,
      unit,
      unitCost: unitCostDecimal.toFixed(2),
      shortageCost: shortageCostDecimal ? shortageCostDecimal.toFixed(2) : null,
    };
  });

export type ValidatedMenuItemInput = z.output<typeof menuItemInputSchema>;

export const updateMenuItemSchema = z.object({
  id: z.string().min(1),
  input: menuItemInputSchema,
});

export const toggleMenuItemActiveSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

export const importMenuItemsBatchSchema = z.object({
  rows: z.array(menuItemInputSchema).min(1).max(500),
});

export function computeDefaultShortageCost(unitCost: string | number): string {
  const base = new Prisma.Decimal(normalizeDecimalString(unitCost) || "0");
  return base
    .mul(new Prisma.Decimal("1.5"))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed(2);
}
