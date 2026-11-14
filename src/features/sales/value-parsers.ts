import { type SalesChannel } from "@prisma/client";
import { Prisma } from "@prisma/client";

export function stripBom(input: string): string {
  return input.replace(/^\uFEFF/, "");
}

export function normalizeDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function normalizeMatchText(value: string): string {
  return normalizeDigits(stripBom(value))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isValidUtcYmd(year: number, month: number, day: number): Date | null {
  if (
    year < 1970 ||
    year > 2099 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function parseFlexibleDate(raw: string): Date | null {
  const cleaned = normalizeDigits(stripBom(raw)).trim();
  if (!cleaned) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(cleaned);
  if (isoMatch) {
    return isValidUtcYmd(
      Number.parseInt(isoMatch[1], 10),
      Number.parseInt(isoMatch[2], 10),
      Number.parseInt(isoMatch[3], 10),
    );
  }

  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cleaned);
  if (dmyMatch) {
    return isValidUtcYmd(
      Number.parseInt(dmyMatch[3], 10),
      Number.parseInt(dmyMatch[2], 10),
      Number.parseInt(dmyMatch[1], 10),
    );
  }

  const serialMatch = /^(\d+(?:\.\d+)?)$/.exec(cleaned);
  if (serialMatch) {
    const serialInt = Math.trunc(Number.parseFloat(serialMatch[1]));
    if (serialInt >= 25569 && serialInt <= 73050) {
      const excelEpochUtcMs = Date.UTC(1899, 11, 30);
      const rawDate = new Date(excelEpochUtcMs + serialInt * 86_400_000);
      return isValidUtcYmd(
        rawDate.getUTCFullYear(),
        rawDate.getUTCMonth() + 1,
        rawDate.getUTCDate(),
      );
    }
  }

  return null;
}

export function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const CHANNEL_ALIAS_MAP: Record<string, SalesChannel> = {
  dine_in: "DINE_IN",
  "dine in": "DINE_IN",
  dinein: "DINE_IN",
  داخلي: "DINE_IN",
  صاله: "DINE_IN",
  مطعم: "DINE_IN",
  delivery: "DELIVERY",
  توصيل: "DELIVERY",
  ديليفري: "DELIVERY",
  طلبات: "DELIVERY",
  takeaway: "TAKEAWAY",
  "take away": "TAKEAWAY",
  pickup: "TAKEAWAY",
  استلام: "TAKEAWAY",
  سفري: "TAKEAWAY",
  "تيك اواي": "TAKEAWAY",
  unspecified: "UNSPECIFIED",
  unknown: "UNSPECIFIED",
  other: "UNSPECIFIED",
  "غير محدد": "UNSPECIFIED",
};

export function parseSalesChannel(
  raw: string | undefined,
): SalesChannel | null {
  if (!raw || raw.trim() === "") {
    return "UNSPECIFIED";
  }
  const normalized = normalizeMatchText(raw)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  const underscoreKey = normalized.replace(/ /g, "_");
  return (
    CHANNEL_ALIAS_MAP[underscoreKey] ?? CHANNEL_ALIAS_MAP[normalized] ?? null
  );
}

export function parseNonNegativeDecimal(
  raw: string,
):
  | { ok: true; value: Prisma.Decimal; isNegative: false }
  | { ok: false; isNegative: boolean } {
  const cleaned = normalizeDigits(stripBom(raw))
    .replace(/[,،\s]/g, "")
    .trim();
  if (!cleaned || !/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    return { ok: false, isNegative: false };
  }
  try {
    const dec = new Prisma.Decimal(cleaned);
    if (!dec.isFinite()) {
      return { ok: false, isNegative: false };
    }
    if (dec.isNegative()) {
      return { ok: false, isNegative: true };
    }
    return { ok: true, value: dec, isNegative: false };
  } catch {
    return { ok: false, isNegative: false };
  }
}
