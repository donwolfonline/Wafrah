import { z } from "zod";

export function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const optionalHttpUrlSchema = z.preprocess(
  emptyToUndefined,
  z
    .string({ invalid_type_error: "Must be a URL string" })
    .refine(isHttpUrl, "Must be a valid http:// or https:// URL")
    .optional(),
);

export const optionalWhatsAppNumberSchema = z.preprocess(
  emptyToUndefined,
  z
    .string({ invalid_type_error: "Must be a phone number string" })
    .refine((value) => {
      const digits = value.replace(/\D/g, "");
      return /^[+\d\s-]+$/.test(value) && digits.length >= 8 && digits.length <= 15;
    }, "Must be an international phone number with 8-15 digits (e.g. 9665XXXXXXXX)")
    .optional(),
);

export const optionalAnalyticsProviderSchema = z.preprocess(
  emptyToUndefined,
  z
    .string({ invalid_type_error: "Must be a string" })
    .regex(
      /^[a-z0-9][a-z0-9_-]{0,31}$/i,
      "Must be an alphanumeric provider key (e.g. plausible, ga4)",
    )
    .optional(),
);

export const ClientEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: optionalHttpUrlSchema,
  NEXT_PUBLIC_APP_URL: optionalHttpUrlSchema,
  NEXT_PUBLIC_WHATSAPP_NUMBER: optionalWhatsAppNumberSchema,
  NEXT_PUBLIC_ANALYTICS_PROVIDER: optionalAnalyticsProviderSchema,
});

export type ClientEnv = z.infer<typeof ClientEnvSchema>;

export function formatZodEnvError(
  issues: readonly z.ZodIssue[],
  scope: string,
): string {
  const varNames = Array.from(
    new Set(
      issues
        .map((issue) => issue.path.join("."))
        .filter((name) => name.length > 0),
    ),
  ).sort();

  const details = issues
    .map((issue) => {
      const key = issue.path.join(".") || "ENV";
      return `- ${key}: ${issue.message}`;
    })
    .join("\n");

  const summary =
    varNames.length > 0
      ? `Missing or invalid variables: ${varNames.join(", ")}`
      : "Environment validation failed";

  return `Invalid environment configuration (${scope}):\n${details}\n${summary}`;
}

export function readRawClientEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
    NEXT_PUBLIC_ANALYTICS_PROVIDER:
      process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER,
  };
}

export function parseClientEnv(rawInput: Record<string, unknown>): ClientEnv {
  const parsed = ClientEnvSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(formatZodEnvError(parsed.error.issues, "client"));
  }
  return parsed.data;
}

function parseClientEnvLenient(rawInput: Record<string, unknown>): ClientEnv {
  const parsed = ClientEnvSchema.safeParse(rawInput);
  if (parsed.success) {
    return parsed.data;
  }
  return {
    NEXT_PUBLIC_SITE_URL:
      typeof rawInput.NEXT_PUBLIC_SITE_URL === "string"
        ? rawInput.NEXT_PUBLIC_SITE_URL.trim() || undefined
        : undefined,
    NEXT_PUBLIC_APP_URL:
      typeof rawInput.NEXT_PUBLIC_APP_URL === "string"
        ? rawInput.NEXT_PUBLIC_APP_URL.trim() || undefined
        : undefined,
    NEXT_PUBLIC_WHATSAPP_NUMBER:
      typeof rawInput.NEXT_PUBLIC_WHATSAPP_NUMBER === "string"
        ? rawInput.NEXT_PUBLIC_WHATSAPP_NUMBER.trim() || undefined
        : undefined,
    NEXT_PUBLIC_ANALYTICS_PROVIDER:
      typeof rawInput.NEXT_PUBLIC_ANALYTICS_PROVIDER === "string"
        ? rawInput.NEXT_PUBLIC_ANALYTICS_PROVIDER.trim() || undefined
        : undefined,
  };
}

const isVitest =
  typeof process !== "undefined" && Boolean(process.env?.VITEST);

const cachedClientEnv: ClientEnv | null = isVitest
  ? null
  : parseClientEnv(readRawClientEnv());

export const clientEnv: ClientEnv = new Proxy({} as ClientEnv, {
  get(_target, prop) {
    if (typeof prop !== "string") {
      return undefined;
    }
    const resolved = cachedClientEnv ?? parseClientEnvLenient(readRawClientEnv());
    return resolved[prop as keyof ClientEnv];
  },
  has(_target, prop) {
    return typeof prop === "string" && prop in ClientEnvSchema.shape;
  },
  ownKeys() {
    return Object.keys(ClientEnvSchema.shape);
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (typeof prop === "string" && prop in ClientEnvSchema.shape) {
      return {
        enumerable: true,
        configurable: true,
        writable: false,
        value: clientEnv[prop as keyof ClientEnv],
      };
    }
    return undefined;
  },
});
