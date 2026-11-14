import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "info" | "warn" | "error";

export interface LogContext {
  requestId: string;
  tenantId?: string | null;
}

export type LogFields = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN =
  /(password|passcode|pin|secret|token|authorization|api[-_]?key|credential|cookie|session)/i;
const PHONE_KEY_PATTERN = /(phone|mobile|tel|whatsapp)/i;
const SAUDI_OR_INTL_PHONE_REGEX =
  /(?:\+966|00966|0)5\d{8}|\+\d{9,15}/g;
const BEARER_REGEX = /\bBearer\s+[A-Za-z0-9._\-+=]+/gi;
const RESEND_KEY_REGEX = /\bre_[A-Za-z0-9_]{8,}\b/g;
const DB_URL_CREDENTIAL_REGEX =
  /(postgres(?:ql)?:\/\/)([^:\s@]+):([^@\s]+)@/gi;
const PASSWORD_PHRASE_REGEX =
  /((?:temporary\s+password|temp\s*password|password|كلمة\s+المرور(?:\s+المؤقتة)?|رمز\s+الدخول|pin)\s*[:=]\s*)([^\s,;]+)/gi;

const logContextStorage = new AsyncLocalStorage<LogContext>();

const SAFE_REQUEST_ID_REGEX = /^[A-Za-z0-9._:/-]{4,128}$/;

/**
 * Generates or normalizes a correlation request ID from incoming HTTP headers.
 */
export function resolveRequestId(
  headers?: Pick<Headers, "get"> | null,
): string {
  const fromHeader =
    headers?.get("x-request-id")?.trim() ??
    headers?.get("x-vercel-id")?.trim();
  if (fromHeader && SAFE_REQUEST_ID_REGEX.test(fromHeader)) {
    return fromHeader;
  }
  return crypto.randomUUID();
}

/**
 * Runs an async/sync callback with `AsyncLocalStorage` request/tenant log context.
 */
export function runWithLogContext<T>(
  context: LogContext,
  fn: () => T,
): T {
  return logContextStorage.run({ ...context }, fn);
}

/**
 * Returns the active request log context, if any.
 */
export function getCurrentLogContext(): LogContext | undefined {
  return logContextStorage.getStore();
}

/**
 * Attaches or updates `tenantId` (or `requestId`) inside the active log context.
 */
export function setLogContextFields(
  partial: Partial<LogContext>,
): void {
  const store = logContextStorage.getStore();
  if (!store) return;
  if (partial.requestId !== undefined) {
    store.requestId = partial.requestId;
  }
  if (partial.tenantId !== undefined) {
    store.tenantId = partial.tenantId;
  }
}

/**
 * Masks a phone number, preserving only its final 4 digits for debugging.
 */
export function maskPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `***${digits.slice(-4)}`;
}

/**
 * Redacts credentials, tokens, PINs, passwords, and phone numbers in free text.
 */
export function redactSensitiveText(input: string, maxLength = 500): string {
  let sanitized = input
    .replace(DB_URL_CREDENTIAL_REGEX, "$1[REDACTED]@")
    .replace(BEARER_REGEX, "Bearer [REDACTED]")
    .replace(RESEND_KEY_REGEX, "re_[REDACTED]")
    .replace(PASSWORD_PHRASE_REGEX, "$1[REDACTED]")
    .replace(SAUDI_OR_INTL_PHONE_REGEX, (match) => maskPhoneNumber(match));

  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength)}...[truncated]`;
  }
  return sanitized;
}

/**
 * Normalizes an unknown error into a redacted, JSON-safe summary.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const out: Record<string, unknown> = {
      name: error.name,
      message: redactSensitiveText(error.message),
    };
    const code = (error as Error & { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") {
      out.code = code;
    }
    return out;
  }
  if (typeof error === "string") {
    return { message: redactSensitiveText(error) };
  }
  return { message: redactSensitiveText(String(error)) };
}

function sanitizeValue(
  key: string,
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) return value;

  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (PHONE_KEY_PATTERN.test(key) && typeof value === "string") {
    return maskPhoneNumber(value);
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return typeof value === "bigint" ? value.toString() : value;
  }

  if (depth >= 4 || typeof value !== "object") {
    return "[Object]";
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item, depth + 1, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (childValue === undefined) continue;
    sanitized[childKey] = sanitizeValue(childKey, childValue, depth + 1, seen);
  }
  return sanitized;
}

/**
 * Emits a structured single-line JSON log record with request/tenant correlation
 * and automatic PII/secret redaction.
 */
export function logStructured(
  level: LogLevel,
  event: string,
  fields?: LogFields,
): void {
  const ctx = logContextStorage.getStore();
  const seen = new WeakSet<object>();

  const sanitizedFields = fields
    ? (sanitizeValue("root", fields, 0, seen) as Record<string, unknown>)
    : {};

  const requestId =
    (typeof sanitizedFields.requestId === "string"
      ? sanitizedFields.requestId
      : undefined) ??
    ctx?.requestId ??
    null;

  const tenantId =
    (sanitizedFields.tenantId !== undefined
      ? (sanitizedFields.tenantId as string | null)
      : undefined) ??
    ctx?.tenantId ??
    null;

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    requestId,
    tenantId,
    ...sanitizedFields,
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export const logger = {
  info(event: string, fields?: LogFields): void {
    logStructured("info", event, fields);
  },
  warn(event: string, fields?: LogFields): void {
    logStructured("warn", event, fields);
  },
  error(event: string, fields?: LogFields): void {
    logStructured("error", event, fields);
  },
};
