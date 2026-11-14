import type { Shift } from "@prisma/client";
import { RIYADH_TIME_ZONE } from "@/lib/format";

export interface ShiftConfig {
  MORNING: string;
  EVENING: string;
  NIGHT: string;
}

export const DEFAULT_SHIFT_CONFIG: ShiftConfig = {
  MORNING: "05:00",
  EVENING: "15:00",
  NIGHT: "23:00",
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeMinutes(
  hhmm: string | undefined | null,
  fallbackMinutes: number,
): number {
  if (!hhmm || typeof hhmm !== "string") {
    return fallbackMinutes;
  }
  const match = TIME_PATTERN.exec(hhmm.trim());
  if (!match) {
    return fallbackMinutes;
  }
  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  return hours * 60 + minutes;
}

export function parseShiftConfig(raw: unknown): ShiftConfig {
  let obj: Record<string, unknown> | null = null;

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
      }
    } catch {
      obj = null;
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }

  const morning =
    typeof obj?.MORNING === "string" && TIME_PATTERN.test(obj.MORNING.trim())
      ? obj.MORNING.trim()
      : DEFAULT_SHIFT_CONFIG.MORNING;
  const evening =
    typeof obj?.EVENING === "string" && TIME_PATTERN.test(obj.EVENING.trim())
      ? obj.EVENING.trim()
      : DEFAULT_SHIFT_CONFIG.EVENING;
  const night =
    typeof obj?.NIGHT === "string" && TIME_PATTERN.test(obj.NIGHT.trim())
      ? obj.NIGHT.trim()
      : DEFAULT_SHIFT_CONFIG.NIGHT;

  return {
    MORNING: morning,
    EVENING: evening,
    NIGHT: night,
  };
}

export function getMinutesSinceMidnightInTimeZone(
  date: Date = new Date(),
  timeZone: string = RIYADH_TIME_ZONE,
): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    numberingSystem: "latn",
  });

  const parts = formatter.formatToParts(date);
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "0";

  const rawHour = Number.parseInt(hourStr, 10);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number.parseInt(minuteStr, 10);

  return hour * 60 + minute;
}

export function detectShiftFromMinutes(
  minutesSinceMidnight: number,
  shiftConfigInput?: unknown,
): Shift {
  const config = parseShiftConfig(shiftConfigInput);
  const entries: Array<{ shift: Shift; startMinutes: number }> = [
    {
      shift: "MORNING",
      startMinutes: parseTimeMinutes(config.MORNING, 5 * 60),
    },
    {
      shift: "EVENING",
      startMinutes: parseTimeMinutes(config.EVENING, 15 * 60),
    },
    {
      shift: "NIGHT",
      startMinutes: parseTimeMinutes(config.NIGHT, 23 * 60),
    },
  ];

  entries.sort((a, b) => a.startMinutes - b.startMinutes);

  const first = entries[0]!;
  const second = entries[1]!;
  const third = entries[2]!;

  const normalized = ((minutesSinceMidnight % 1440) + 1440) % 1440;

  if (normalized >= first.startMinutes && normalized < second.startMinutes) {
    return first.shift;
  }
  if (normalized >= second.startMinutes && normalized < third.startMinutes) {
    return second.shift;
  }
  return third.shift;
}

export function detectShift(
  date: Date = new Date(),
  shiftConfigInput?: unknown,
  timeZone: string = RIYADH_TIME_ZONE,
): Shift {
  const minutes = getMinutesSinceMidnightInTimeZone(date, timeZone);
  return detectShiftFromMinutes(minutes, shiftConfigInput);
}

export function getRiyadhDayBoundsUtc(
  referenceDate: Date = new Date(),
  timeZone: string = RIYADH_TIME_ZONE,
): { startUtc: Date; endUtc: Date; dateStr: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    numberingSystem: "latn",
  });

  const parts = formatter.formatToParts(referenceDate);
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const dateStr = `${year}-${month}-${day}`;

  // Asia/Riyadh is permanently UTC+03:00
  const startUtc = new Date(`${dateStr}T00:00:00.000+03:00`);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return { startUtc, endUtc, dateStr };
}
