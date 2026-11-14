import { z } from "zod";
import {
  ClientEnvSchema,
  emptyToUndefined,
  isHttpUrl,
  optionalHttpUrlSchema,
} from "./env.client";

export type EnvRuntimeMode =
  | "production"
  | "preview"
  | "build"
  | "development"
  | "test";

const PLACEHOLDER_FRAGMENTS = [
  "replace-with",
  "changeme",
  "local-dev-auth-secret",
  "change-in-production",
] as const;

const optionalTrimmedString = z.preprocess(
  emptyToUndefined,
  z.string({ invalid_type_error: "Must be a string" }).optional(),
);

function isPostgresUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
  } catch {
    return false;
  }
}

export function isLocalHostname(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "127.0.0.1" ||
      host.startsWith("127.") ||
      host === "::1" ||
      host === "0.0.0.0"
    );
  } catch {
    return false;
  }
}

export function isPooledPostgresUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.hostname.toLowerCase().includes("-pooler") ||
      parsed.port === "6543" ||
      parsed.searchParams.get("pgbouncer") === "true"
    );
  } catch {
    return false;
  }
}

function isPlaceholderSecret(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return (
    lower === "re_replace_with_api_key" ||
    PLACEHOLDER_FRAGMENTS.some((fragment) => lower.includes(fragment))
  );
}

function isValidEmailFrom(value: string): boolean {
  const angleMatch = /^[^<>]+<([^<>]+)>$/.exec(value.trim());
  const candidate = angleMatch ? angleMatch[1].trim() : value.trim();
  return z.string().email().safeParse(candidate).success;
}

const optionalPostgresUrlSchema = z.preprocess(
  emptyToUndefined,
  z
    .string({ invalid_type_error: "Must be a PostgreSQL connection string" })
    .refine(
      isPostgresUrl,
      "Must be a valid postgres:// or postgresql:// connection URL",
    )
    .optional(),
);

const optionalEmailSchema = z.preprocess(
  emptyToUndefined,
  z
    .string({ invalid_type_error: "Must be an email address string" })
    .email("Must be a valid email address")
    .optional(),
);

const optionalEmailFromSchema = z.preprocess(
  emptyToUndefined,
  z
    .string({ invalid_type_error: "Must be a sender email string" })
    .refine(
      isValidEmailFrom,
      'Must be a valid email or "Display Name <email@domain>" format',
    )
    .optional(),
);

export const ServerEnvSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z
      .enum(["development", "test", "production"], {
        message: "Must be development, test, or production",
      })
      .default("development"),
  ),
  VERCEL: optionalTrimmedString,
  VERCEL_ENV: z.preprocess(
    emptyToUndefined,
    z
      .enum(["development", "preview", "production"], {
        message: "Must be development, preview, or production",
      })
      .optional(),
  ),
  VERCEL_URL: optionalTrimmedString,
  VERCEL_PROJECT_PRODUCTION_URL: optionalTrimmedString,
  VERCEL_GIT_COMMIT_SHA: optionalTrimmedString,
  VERCEL_DEPLOYMENT_ID: optionalTrimmedString,
  VERCEL_REGION: optionalTrimmedString,
  WAFRAH_BUILD_ID: optionalTrimmedString,
  NEXT_DIST_DIR: optionalTrimmedString,
  NEXT_PHASE: optionalTrimmedString,
  NEXT_RUNTIME: optionalTrimmedString,
  DATABASE_URL: optionalPostgresUrlSchema,
  DIRECT_URL: optionalPostgresUrlSchema,
  AUTH_SECRET: z.preprocess(
    emptyToUndefined,
    z
      .string({ invalid_type_error: "Must be a string" })
      .min(32, "AUTH_SECRET must be at least 32 characters")
      .optional(),
  ),
  APP_URL: optionalHttpUrlSchema,
  AUTH_URL: optionalHttpUrlSchema,
  AUTH_TRUST_HOST: z.preprocess(
    emptyToUndefined,
    z
      .enum(["true", "false"], { message: 'Must be "true" or "false"' })
      .optional(),
  ),
  RESEND_API_KEY: z.preprocess(
    emptyToUndefined,
    z
      .string({ invalid_type_error: "Must be a Resend API key string" })
      .refine(
        (value) =>
          value === "re_replace_with_api_key" ||
          (value.startsWith("re_") && value.length >= 10),
        'RESEND_API_KEY must start with "re_" and be at least 10 characters',
      )
      .optional(),
  ),
  EMAIL_FROM: optionalEmailFromSchema,
  CRON_SECRET: z.preprocess(
    emptyToUndefined,
    z
      .string({ invalid_type_error: "Must be a string" })
      .min(16, "CRON_SECRET must be at least 16 characters")
      .optional(),
  ),
  FOUNDER_EMAIL: optionalEmailSchema,
  SKIP_MIGRATE_DEPLOY: z.preprocess(
    emptyToUndefined,
    z
      .enum(["0", "1", "true", "false"], {
        message: "Must be 0, 1, true, or false",
      })
      .optional(),
  ),
  SUPPORT_CONTACT_NAME: optionalTrimmedString,
  SUPPORT_CONTACT_EMAIL: optionalEmailSchema,
  SUPPORT_CONTACT_PHONE: optionalTrimmedString,
  SUPPORT_WHATSAPP_URL: optionalHttpUrlSchema,
  ADMIN_EMAIL: optionalEmailSchema,
  ADMIN_PASSWORD: optionalTrimmedString,
  ADMIN_NAME: optionalTrimmedString,
  ADMIN_USERNAME: optionalTrimmedString,
  ADMIN_LOCALE: z.preprocess(
    emptyToUndefined,
    z.enum(["ar", "en"], { message: "Must be ar or en" }).optional(),
  ),
  USER: optionalTrimmedString,
  LOGNAME: optionalTrimmedString,
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: optionalTrimmedString,
  CI: optionalTrimmedString,
  LANDING_SCREENSHOT_DIR: optionalTrimmedString,
  QA_SCREENSHOT_DIR: optionalTrimmedString,
  ADMIN_SCREENSHOT_DIR: optionalTrimmedString,
});

export const EnvSchema = ServerEnvSchema.merge(ClientEnvSchema);

export type ServerEnv = z.infer<typeof ServerEnvSchema>;
export type ValidatedEnv = z.infer<typeof EnvSchema>;

export function resolveEnvMode(
  data: Pick<ValidatedEnv, "NODE_ENV" | "VERCEL" | "VERCEL_ENV" | "NEXT_PHASE">,
  options?: { isBuildPhase?: boolean; mode?: EnvRuntimeMode },
): EnvRuntimeMode {
  if (options?.mode) {
    return options.mode;
  }
  if (data.VERCEL_ENV === "production") {
    return "production";
  }
  if (data.VERCEL_ENV === "preview") {
    return "preview";
  }
  const isBuildPhase =
    options?.isBuildPhase ?? data.NEXT_PHASE === "phase-production-build";
  if (data.NODE_ENV === "production") {
    return isBuildPhase && data.VERCEL !== "1" ? "build" : "production";
  }
  return data.NODE_ENV === "test" ? "test" : "development";
}

function addRequiredIssue(
  ctx: z.RefinementCtx,
  key: keyof ValidatedEnv,
  message: string,
): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [key],
    message,
  });
}

export function applyStrictEnvRules(
  data: ValidatedEnv,
  mode: EnvRuntimeMode,
  ctx: z.RefinementCtx,
): void {
  if (mode !== "production" && mode !== "preview") {
    return;
  }

  if (!data.DATABASE_URL) {
    addRequiredIssue(ctx, "DATABASE_URL", `Required in ${mode}`);
  } else if (
    (data.VERCEL_ENV === "production" || mode === "preview") &&
    isLocalHostname(data.DATABASE_URL)
  ) {
    addRequiredIssue(
      ctx,
      "DATABASE_URL",
      `Must not point to localhost in ${mode}`,
    );
  }

  if (!data.AUTH_SECRET) {
    addRequiredIssue(
      ctx,
      "AUTH_SECRET",
      `Required in ${mode} (minimum 32 characters)`,
    );
  } else if (isPlaceholderSecret(data.AUTH_SECRET)) {
    addRequiredIssue(
      ctx,
      "AUTH_SECRET",
      `Must not use a placeholder or dev secret in ${mode}`,
    );
  }

  if (data.CRON_SECRET && isPlaceholderSecret(data.CRON_SECRET)) {
    addRequiredIssue(
      ctx,
      "CRON_SECRET",
      `Must not use a placeholder secret in ${mode}`,
    );
  }

  if (mode !== "production") {
    return;
  }

  if (!data.CRON_SECRET) {
    addRequiredIssue(
      ctx,
      "CRON_SECRET",
      "Required in production (minimum 16 characters)",
    );
  }

  if (!data.RESEND_API_KEY) {
    addRequiredIssue(ctx, "RESEND_API_KEY", "Required in production");
  } else if (isPlaceholderSecret(data.RESEND_API_KEY)) {
    addRequiredIssue(
      ctx,
      "RESEND_API_KEY",
      "Must not use a placeholder API key in production",
    );
  }

  if (!data.APP_URL) {
    addRequiredIssue(ctx, "APP_URL", "Required in production");
  } else if (data.VERCEL_ENV === "production") {
    if (!data.APP_URL.toLowerCase().startsWith("https://")) {
      addRequiredIssue(ctx, "APP_URL", "Must use https:// in Vercel production");
    } else if (isLocalHostname(data.APP_URL)) {
      addRequiredIssue(ctx, "APP_URL", "Must not point to localhost in production");
    }
  } else if (!isHttpUrl(data.APP_URL)) {
    addRequiredIssue(ctx, "APP_URL", "Must be a valid http(s) URL");
  }

  if (!data.NEXT_PUBLIC_SITE_URL) {
    addRequiredIssue(ctx, "NEXT_PUBLIC_SITE_URL", "Required in production");
  } else if (data.VERCEL_ENV === "production") {
    if (!data.NEXT_PUBLIC_SITE_URL.toLowerCase().startsWith("https://")) {
      addRequiredIssue(
        ctx,
        "NEXT_PUBLIC_SITE_URL",
        "Must use https:// in Vercel production",
      );
    } else if (isLocalHostname(data.NEXT_PUBLIC_SITE_URL)) {
      addRequiredIssue(
        ctx,
        "NEXT_PUBLIC_SITE_URL",
        "Must not point to localhost in production",
      );
    }
  }

  if (!data.NEXT_PUBLIC_WHATSAPP_NUMBER) {
    addRequiredIssue(ctx, "NEXT_PUBLIC_WHATSAPP_NUMBER", "Required in production");
  }

  if (!data.FOUNDER_EMAIL) {
    addRequiredIssue(ctx, "FOUNDER_EMAIL", "Required in production");
  }
}
