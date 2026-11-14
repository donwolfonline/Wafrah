import { randomInt } from "node:crypto";

const CITY_ABBREVIATIONS: Record<string, string> = {
  RIYADH: "RYD",
  JEDDAH: "JED",
  MAKKAH: "MKH",
  MECCA: "MKH",
  MADINAH: "MED",
  MEDINA: "MED",
  DAMMAM: "DMM",
  KHOBAR: "KHB",
  ALKHOBAR: "KHB",
  TAIF: "TAF",
  ABHA: "ABH",
  TABUK: "TBK",
  QASSIM: "QSM",
};

const STOP_WORDS = new Set(["AL", "EL", "THE", "RESTAURANT", "HOTEL", "CAFE"]);

const UPPER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER_CHARS = "abcdefghijkmnopqrstuvwxyz";
const DIGIT_CHARS = "23456789";
const SYMBOL_CHARS = "!@#$%";
const ALL_PASSWORD_CHARS = `${UPPER_CHARS}${LOWER_CHARS}${DIGIT_CHARS}${SYMBOL_CHARS}`;

function extractAsciiTokens(value: string): string[] {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9\s]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function resolveCityCode(city: string): string {
  const normalized = city.toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized && CITY_ABBREVIATIONS[normalized]) {
    return CITY_ABBREVIATIONS[normalized];
  }
  if (normalized.length >= 3) {
    return normalized.slice(0, 3);
  }
  return "KSA";
}

/**
 * Builds a deterministic human-readable restaurant login code candidate such as
 * `NAJD-RYD` or `NAJD-RYD-02`. Falls back to `WAF-<CITY>` if the restaurant
 * name contains no ASCII characters.
 */
export function buildRestaurantCodeCandidate(
  name: string,
  city: string,
  attempt = 0,
): string {
  const tokens = extractAsciiTokens(name).filter((t) => !STOP_WORDS.has(t));
  const fallbackTokens = extractAsciiTokens(name);
  const chosen = tokens[0] ?? fallbackTokens[0] ?? "WAF";
  const prefix = chosen.slice(0, 6).replace(/[^A-Z0-9]/g, "") || "WAF";
  const cityCode = resolveCityCode(city);

  if (attempt <= 0) {
    return `${prefix}-${cityCode}`;
  }
  if (attempt < 100) {
    return `${prefix}-${cityCode}-${String(attempt).padStart(2, "0")}`;
  }
  return `${prefix}-${cityCode}-${randomInt(100, 999)}`;
}

/**
 * Generates a cryptographically random one-time temporary password containing
 * uppercase, lowercase, digits, and safe symbols while omitting ambiguous characters.
 */
export function generateTemporaryPassword(length = 14): string {
  const safeLength = Math.max(12, length);
  const chars: string[] = [
    UPPER_CHARS[randomInt(UPPER_CHARS.length)] ?? "A",
    LOWER_CHARS[randomInt(LOWER_CHARS.length)] ?? "a",
    DIGIT_CHARS[randomInt(DIGIT_CHARS.length)] ?? "7",
    SYMBOL_CHARS[randomInt(SYMBOL_CHARS.length)] ?? "!",
  ];

  while (chars.length < safeLength) {
    chars.push(ALL_PASSWORD_CHARS[randomInt(ALL_PASSWORD_CHARS.length)] ?? "x");
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j]!;
    chars[j] = tmp!;
  }

  return chars.join("");
}

export function deriveManagerUsername(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const sanitized = localPart
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 32);
  return sanitized.length >= 2 ? sanitized : "manager";
}
