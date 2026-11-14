import { z } from "zod";
import { diffDateKeys } from "@/features/insights/math";

const YEAR_MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validation error thrown by report service boundaries (HTTP 400). */
export class ReportsValidationError extends Error {
  public readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "ReportsValidationError";
  }
}

export const BaselineUpdateSchema = z
  .object({
    baselineStart: z.string().regex(DATE_KEY_RE).nullable(),
    baselineEnd: z.string().regex(DATE_KEY_RE).nullable(),
  })
  .refine(
    (v) =>
      (v.baselineStart === null && v.baselineEnd === null) ||
      (v.baselineStart !== null &&
        v.baselineEnd !== null &&
        v.baselineStart <= v.baselineEnd &&
        diffDateKeys(v.baselineStart, v.baselineEnd) <= 365),
    { message: "Invalid baseline date range" },
  );

export interface MonthWindow {
  yearMonth: string;
  monthStartDate: string;
  monthLastDayDate: string;
  periodEndDate: string;
  days: number;
}

/**
 * Parses `YYYY-MM` and clamps the evaluation window to `asOfDateKey` when
 * inspecting the active calendar month so partial-month weekly averages stay honest.
 */
export function parseMonthWindow(
  yearMonth: string,
  asOfDateKey: string,
): MonthWindow {
  const match = YEAR_MONTH_RE.exec(yearMonth);
  if (!match) {
    throw new ReportsValidationError("Invalid YYYY-MM report month");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const monthStartDate = `${match[1]}-${match[2]}-01`;
  const monthLastDayDate = new Date(Date.UTC(year, month, 0))
    .toISOString()
    .slice(0, 10);

  const isCurrentMonth = yearMonth === asOfDateKey.slice(0, 7);
  const periodEndDate =
    isCurrentMonth && asOfDateKey < monthLastDayDate
      ? asOfDateKey
      : monthLastDayDate;

  return {
    yearMonth,
    monthStartDate,
    monthLastDayDate,
    periodEndDate,
    days: Math.max(1, diffDateKeys(monthStartDate, periodEndDate) + 1),
  };
}
