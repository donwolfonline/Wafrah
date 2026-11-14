import { Prisma, type Unit } from "@prisma/client";
import {
  decimalMax,
  decimalMin,
  diffDateKeys,
  enumerateDateKeys,
  getDateKeyWeekday,
  shiftDateKey,
  toDecimal,
  toTimeZoneDateKey,
} from "@/features/insights/math";
import type { DecimalInput } from "@/features/insights/types";
import type { ForecastEventEntry } from "./types";

export {
  decimalMax,
  decimalMin,
  diffDateKeys,
  enumerateDateKeys,
  getDateKeyWeekday,
  shiftDateKey,
  toDecimal,
  toTimeZoneDateKey,
};

// Acklam's rational approximation coefficients for inverse standard normal CDF.
const A = [
  -3.969683028665376e1,
  2.209460984245205e2,
  -2.759285104469687e2,
  1.38357751867269e2,
  -3.066479806614716e1,
  2.506628277459239,
] as const;

const B = [
  -5.447609879822406e1,
  1.615858368580409e2,
  -1.556989798598866e2,
  6.680131188771972e1,
  -1.328068155288572e1,
] as const;

const C = [
  -7.784894002430293e-3,
  -3.223964580411365e-1,
  -2.400758277161838,
  -2.549732539343734,
  4.374664141464968,
  2.938163982698783,
] as const;

const D = [
  7.784695709041462e-3,
  3.224671290700398e-1,
  2.445134137142996,
  3.754408661907416,
] as const;

const P_LOW = 0.02425;
const P_HIGH = 1 - P_LOW;

/**
 * Computes the inverse standard normal CDF (quantile function) using
 * Peter J. Acklam's rational approximation (relative error < 1.15e-9).
 */
export function inverseStandardNormalCdf(p: number): number {
  if (!Number.isFinite(p) || p < 0 || p > 1) {
    throw new RangeError(`Probability must be between 0 and 1, received ${p}`);
  }
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;

  if (p < P_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    const num =
      ((((C[0]! * q + C[1]!) * q + C[2]!) * q + C[3]!) * q + C[4]!) * q + C[5]!;
    const den = (((D[0]! * q + D[1]!) * q + D[2]!) * q + D[3]!) * q + 1;
    return num / den;
  }

  if (p > P_HIGH) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    const num =
      ((((C[0]! * q + C[1]!) * q + C[2]!) * q + C[3]!) * q + C[4]!) * q + C[5]!;
    const den = (((D[0]! * q + D[1]!) * q + D[2]!) * q + D[3]!) * q + 1;
    return -(num / den);
  }

  const q = p - 0.5;
  const r = q * q;
  const num =
    (((((A[0]! * r + A[1]!) * r + A[2]!) * r + A[3]!) * r + A[4]!) * r +
      A[5]!) *
    q;
  const den =
    ((((B[0]! * r + B[1]!) * r + B[2]!) * r + B[3]!) * r + B[4]!) * r + 1;
  return num / den;
}

export function normalizeDateOnlyKey(input: Date | string): string {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    return new Date(trimmed).toISOString().slice(0, 10);
  }
  return input.toISOString().slice(0, 10);
}

export function roundToUnitStep(
  value: DecimalInput,
  unit: Unit,
): Prisma.Decimal {
  const dec = decimalMax(new Prisma.Decimal(0), toDecimal(value));
  if (unit === "KG" || unit === "LITER") {
    const half = new Prisma.Decimal("0.5");
    return dec
      .div(half)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .mul(half)
      .toDecimalPlaces(1);
  }
  return dec.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

export function decimalSampleStdDev(values: Prisma.Decimal[]): Prisma.Decimal {
  if (values.length < 2) {
    return new Prisma.Decimal(0);
  }
  let sum = new Prisma.Decimal(0);
  for (const val of values) {
    sum = sum.add(val);
  }
  const mean = sum.div(values.length);
  let sqDiffSum = new Prisma.Decimal(0);
  for (const val of values) {
    const diff = val.sub(mean);
    sqDiffSum = sqDiffSum.add(diff.mul(diff));
  }
  const variance = sqDiffSum.div(values.length - 1);
  return variance.sqrt();
}

export function resolveEventMultiplier(
  dateKey: string,
  events: ForecastEventEntry[],
  tenantId?: string,
): {
  multiplier: Prisma.Decimal;
  scope: "TENANT" | "GLOBAL" | "NONE";
  eventName: string | null;
  eventNameAr: string | null;
} {
  const active = events.filter((ev) => {
    const start = normalizeDateOnlyKey(ev.startDate);
    const end = normalizeDateOnlyKey(ev.endDate);
    return dateKey >= start && dateKey <= end;
  });

  if (active.length === 0) {
    return {
      multiplier: new Prisma.Decimal(1),
      scope: "NONE",
      eventName: null,
      eventNameAr: null,
    };
  }

  const tenantEvents = tenantId
    ? active.filter((ev) => ev.tenantId === tenantId)
    : [];
  const globalEvents = active.filter((ev) => !ev.tenantId);

  const candidates = tenantEvents.length > 0 ? tenantEvents : globalEvents;
  if (candidates.length === 0) {
    return {
      multiplier: new Prisma.Decimal(1),
      scope: "NONE",
      eventName: null,
      eventNameAr: null,
    };
  }

  const scope: "TENANT" | "GLOBAL" =
    tenantEvents.length > 0 ? "TENANT" : "GLOBAL";

  const chosen = [...candidates].sort((a, b) => {
    const spanA = diffDateKeys(
      normalizeDateOnlyKey(a.startDate),
      normalizeDateOnlyKey(a.endDate),
    );
    const spanB = diffDateKeys(
      normalizeDateOnlyKey(b.startDate),
      normalizeDateOnlyKey(b.endDate),
    );
    if (spanA !== spanB) return spanA - spanB;
    return toDecimal(b.demandMultiplier).comparedTo(
      toDecimal(a.demandMultiplier),
    );
  })[0]!;

  return {
    multiplier: toDecimal(chosen.demandMultiplier),
    scope,
    eventName: chosen.name,
    eventNameAr: chosen.nameAr ?? null,
  };
}
