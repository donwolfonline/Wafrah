import { z } from "zod";
import {
  ClientEnvSchema,
  type ClientEnv,
  clientEnv,
  formatZodEnvError,
  parseClientEnv,
} from "./env.client";
import {
  type EnvRuntimeMode,
  EnvSchema,
  type ServerEnv,
  ServerEnvSchema,
  type ValidatedEnv,
  applyStrictEnvRules,
  isLocalHostname,
  isPooledPostgresUrl,
  resolveEnvMode,
} from "./env.schema";

export {
  ClientEnvSchema,
  EnvSchema,
  ServerEnvSchema,
  clientEnv,
  parseClientEnv,
  resolveEnvMode,
  type ClientEnv,
  type EnvRuntimeMode,
  type ServerEnv,
  type ValidatedEnv,
};

export function isVitestRuntime(): boolean {
  return typeof process !== "undefined" && Boolean(process.env?.VITEST);
}

export function readRawProcessEnv(): Record<string, string | undefined> {
  if (typeof process === "undefined" || !process.env) {
    return {};
  }
  return { ...process.env };
}

export function validateEnv(
  rawInput: Record<string, unknown>,
  options?: { isBuildPhase?: boolean; mode?: EnvRuntimeMode },
): ValidatedEnv {
  const modeHint = resolveEnvMode(
    {
      NODE_ENV:
        rawInput.NODE_ENV === "production" ||
        rawInput.NODE_ENV === "test" ||
        rawInput.NODE_ENV === "development"
          ? rawInput.NODE_ENV
          : "development",
      VERCEL: typeof rawInput.VERCEL === "string" ? rawInput.VERCEL : undefined,
      VERCEL_ENV:
        rawInput.VERCEL_ENV === "production" ||
        rawInput.VERCEL_ENV === "preview" ||
        rawInput.VERCEL_ENV === "development"
          ? rawInput.VERCEL_ENV
          : undefined,
      NEXT_PHASE:
        typeof rawInput.NEXT_PHASE === "string" ? rawInput.NEXT_PHASE : undefined,
    },
    options,
  );

  const strictSchema = EnvSchema.superRefine((data, ctx) => {
    const resolvedMode = resolveEnvMode(data, options);
    applyStrictEnvRules(data, resolvedMode, ctx);
  });

  const parsed = strictSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(formatZodEnvError(parsed.error.issues, modeHint));
  }
  return parsed.data;
}

export function parseServerEnv(
  rawInput: Record<string, unknown>,
  options?: { isBuildPhase?: boolean; mode?: EnvRuntimeMode },
): ValidatedEnv {
  return validateEnv(rawInput, options);
}

export function parseVitestLiveEnv(
  rawInput: Record<string, unknown>,
): ValidatedEnv {
  const parsed = EnvSchema.safeParse(rawInput);
  if (parsed.success) {
    return parsed.data;
  }

  const safeFallback: Record<string, unknown> = {};
  for (const key of Object.keys(EnvSchema.shape)) {
    const raw = rawInput[key];
    safeFallback[key] =
      typeof raw === "string" ? raw.trim() || undefined : undefined;
  }
  const nodeEnv = rawInput.NODE_ENV;
  safeFallback.NODE_ENV =
    nodeEnv === "production" || nodeEnv === "test" || nodeEnv === "development"
      ? nodeEnv
      : "test";
  return safeFallback as ValidatedEnv;
}

export function parseNextConfigEnv(phase: string): ValidatedEnv {
  return validateEnv(readRawProcessEnv(), {
    isBuildPhase: phase === "phase-production-build",
  });
}

const RuntimeFlagsSchema = ServerEnvSchema.pick({
  NODE_ENV: true,
  VERCEL_ENV: true,
});

export function readRuntimeFlags() {
  const parsed = RuntimeFlagsSchema.safeParse(readRawProcessEnv());
  if (!parsed.success) {
    throw new Error(formatZodEnvError(parsed.error.issues, "runtime"));
  }
  return parsed.data;
}

const SeedCliEnvSchema = ServerEnvSchema.pick({
  NODE_ENV: true,
  VERCEL_ENV: true,
  DATABASE_URL: true,
  DIRECT_URL: true,
  USER: true,
  LOGNAME: true,
  ADMIN_EMAIL: true,
  ADMIN_PASSWORD: true,
  ADMIN_NAME: true,
  ADMIN_USERNAME: true,
  ADMIN_LOCALE: true,
}).superRefine((data, ctx) => {
  if (!data.DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "Required for database CLI operations",
    });
  }
});

export function validateMigrationEnv(
  rawInput: Record<string, unknown>,
): { DATABASE_URL: string; DIRECT_URL?: string } {
  const MigrationSchema = ServerEnvSchema.pick({
    NODE_ENV: true,
    VERCEL_ENV: true,
    DATABASE_URL: true,
    DIRECT_URL: true,
  }).superRefine((data, ctx) => {
    if (!data.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "Required for database migrations",
      });
      return;
    }

    if (isPooledPostgresUrl(data.DATABASE_URL) && !data.DIRECT_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DIRECT_URL"],
        message:
          "Required for prisma migrate deploy when DATABASE_URL is a pooled connection",
      });
    }

    if (
      (data.VERCEL_ENV === "production" ||
        data.VERCEL_ENV === "preview" ||
        data.NODE_ENV === "production") &&
      isLocalHostname(data.DATABASE_URL)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "Migration target must not point to localhost in production/preview",
      });
    }
  });

  const parsed = MigrationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(formatZodEnvError(parsed.error.issues, "migration-cli"));
  }
  return {
    DATABASE_URL: parsed.data.DATABASE_URL!,
    DIRECT_URL: parsed.data.DIRECT_URL,
  };
}

export function parseSeedCliEnv() {
  const raw = readRawProcessEnv();
  const parsed = SeedCliEnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(formatZodEnvError(parsed.error.issues, "seed-cli"));
  }
  return {
    config: parsed.data,
    rawSeedEnv: {
      ADMIN_EMAIL: raw.ADMIN_EMAIL,
      ADMIN_PASSWORD: raw.ADMIN_PASSWORD,
      ADMIN_NAME: raw.ADMIN_NAME,
      ADMIN_USERNAME: raw.ADMIN_USERNAME,
      ADMIN_LOCALE: raw.ADMIN_LOCALE,
    },
  };
}

const ToolingEnvSchema = ServerEnvSchema.pick({
  NODE_ENV: true,
  VERCEL_ENV: true,
  APP_URL: true,
  CI: true,
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: true,
  LANDING_SCREENSHOT_DIR: true,
  QA_SCREENSHOT_DIR: true,
  ADMIN_SCREENSHOT_DIR: true,
});

export function readToolingEnv() {
  const parsed = ToolingEnvSchema.safeParse(readRawProcessEnv());
  if (!parsed.success) {
    throw new Error(formatZodEnvError(parsed.error.issues, "tooling"));
  }
  return parsed.data;
}
