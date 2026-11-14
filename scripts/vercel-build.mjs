import { execFileSync } from "node:child_process";
import { z } from "zod";

const emptyToUndefined = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

function isLocalHostname(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host.startsWith("127.")
    );
  } catch {
    return false;
  }
}

const optionalPostgresUrl = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return (
          parsed.protocol === "postgres:" || parsed.protocol === "postgresql:"
        );
      } catch {
        return false;
      }
    }, "Must be a valid postgres:// or postgresql:// URL")
    .optional(),
);

const VercelBuildEnvSchema = z
  .object({
    VERCEL_ENV: z.preprocess(
      emptyToUndefined,
      z.enum(["development", "preview", "production"]).optional(),
    ),
    SKIP_MIGRATE_DEPLOY: z.preprocess(
      emptyToUndefined,
      z.enum(["0", "1", "true", "false"]).optional(),
    ),
    DIRECT_URL: optionalPostgresUrl,
    DATABASE_URL: optionalPostgresUrl,
  })
  .superRefine((data, ctx) => {
    if (
      (data.VERCEL_ENV === "preview" || data.VERCEL_ENV === "production") &&
      data.DATABASE_URL &&
      isLocalHostname(data.DATABASE_URL)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: `Must not point to localhost in ${data.VERCEL_ENV}`,
      });
    }
    if (
      (data.VERCEL_ENV === "preview" || data.VERCEL_ENV === "production") &&
      data.DIRECT_URL &&
      isLocalHostname(data.DIRECT_URL)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DIRECT_URL"],
        message: `Must not point to localhost in ${data.VERCEL_ENV}`,
      });
    }
  });

function runStep(command, args) {
  execFileSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
}

function validateBuildEnv() {
  const parsed = VercelBuildEnvSchema.safeParse({
    VERCEL_ENV: process.env.VERCEL_ENV,
    SKIP_MIGRATE_DEPLOY: process.env.SKIP_MIGRATE_DEPLOY,
    DIRECT_URL: process.env.DIRECT_URL,
    DATABASE_URL: process.env.DATABASE_URL,
  });
  if (!parsed.success) {
    const vars = Array.from(
      new Set(parsed.error.issues.map((i) => i.path.join(".")).filter(Boolean)),
    ).sort();
    throw new Error(
      `Invalid build environment configuration. Check variables: ${vars.join(", ")}`,
    );
  }
  return parsed.data;
}

function main() {
  const buildEnv = validateBuildEnv();
  runStep("pnpm", ["exec", "prisma", "generate"]);

  // Never auto-run prisma migrate deploy, migrate dev, or db push during Vercel builds
  // (Preview or Production). Schema migrations must be executed deliberately via
  // `pnpm db:migrate:deploy` from an approved operator shell or CI gate before cutover.
  console.log(
    JSON.stringify({
      event: "VERCEL_BUILD_MIGRATIONS_DISABLED",
      environment: buildEnv.VERCEL_ENV ?? "local",
      reason:
        "Preview and Production builds never auto-run database migrations; execute `pnpm db:migrate:deploy` deliberately before promoting.",
    }),
  );

  runStep("pnpm", ["exec", "next", "build", "--webpack"]);
}

main();
