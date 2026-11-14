import { Prisma, type Unit } from "@prisma/client";
import { RIYADH_TIME_ZONE } from "@/lib/format";
import type { DecimalInput } from "./types";

const ONE_DAY_MS = 86_400_000;

export function toDecimal(value: DecimalInput): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) {
    return value;
  }
  if (typeof value === "number") {
    return new Prisma.Decimal(Number.isFinite(value) ? value.toString() : "0");
  }
  const trimmed = value.trim();
  return trimmed ? new Prisma.Decimal(trimmed) : new Prisma.Decimal(0);
}

export function decimalMax(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.gte(b) ? a : b;
}

export function decimalMin(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.lte(b) ? a : b;
}

export function decimalMedian(values: Prisma.Decimal[]): Prisma.Decimal {
  if (values.length === 0) {
    return new Prisma.Decimal(0);
  }
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return sorted[mid - 1]!.add(sorted[mid]!).div(2);
}

export function decimalMad(
  values: Prisma.Decimal[],
  medianValue: Prisma.Decimal,
): Prisma.Decimal {
  if (values.length === 0) {
    return new Prisma.Decimal(0);
  }
  const deviations = values.map((v) => v.sub(medianValue).abs());
  return decimalMedian(deviations);
}

export function getUnitFloorQty(unit: Unit): Prisma.Decimal {
  return unit === "KG" || unit === "LITER"
    ? new Prisma.Decimal("0.5")
    : new Prisma.Decimal("1");
}

export function toTimeZoneDateKey(
  input: Date | string,
  timeZone: string = RIYADH_TIME_ZONE,
): string {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim();
  }
  const date = input instanceof Date ? input : new Date(input);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    numberingSystem: "latn",
  });
  return formatter.format(date);
}

export function getDateKeyWeekday(dateKey: string): number {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return date.getUTCDay();
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  const shifted = new Date(base.getTime() + deltaDays * ONE_DAY_MS);
  return shifted.toISOString().slice(0, 10);
}

export function diffDateKeys(startKey: string, endKey: string): number {
  const start = new Date(`${startKey}T00:00:00.000Z`).getTime();
  const end = new Date(`${endKey}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / ONE_DAY_MS);
}

export function enumerateDateKeys(startKey: string, endKey: string): string[] {
  const days = diffDateKeys(startKey, endKey);
  if (days < 0) return [];
  const keys: string[] = [];
  for (let i = 0; i <= days; i++) {
    keys.push(shiftDateKey(startKey, i));
  }
  return keys;
}
