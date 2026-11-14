import { z } from "zod";
import { isLocalHostname } from "../env.schema";
import { hashSecret } from "./password";

const WEAK_PASSWORD_FRAGMENTS = [
  "replace-with",
  "changeme",
  "wafrahadmin",
  "shamimanager",
  "diwanmanager",
  "password123",
  "admin123",
] as const;

function isStrongBootstrapPassword(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (WEAK_PASSWORD_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
    return false;
  }

  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigitOrSymbol = /[0-9]|[^A-Za-z0-9]/.test(value);
  return hasUpper && hasLower && hasDigitOrSymbol;
}

export const ProductionAdminEnvSchema = z.object({
  ADMIN_EMAIL: z
    .string({ required_error: "ADMIN_EMAIL is required" })
    .trim()
    .toLowerCase()
    .email("ADMIN_EMAIL must be a valid email address"),
  ADMIN_PASSWORD: z
    .string({ required_error: "ADMIN_PASSWORD is required" })
    .min(12, "ADMIN_PASSWORD must be at least 12 characters")
    .max(128, "ADMIN_PASSWORD must be at most 128 characters")
    .refine(
      isStrongBootstrapPassword,
      "ADMIN_PASSWORD must include uppercase, lowercase, and a digit or symbol, and must not match demo or placeholder strings",
    ),
  ADMIN_NAME: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .default("Wafrah Platform Admin"),
  ADMIN_USERNAME: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9._-]{2,31}$/,
      "ADMIN_USERNAME must be 3-32 lowercase alphanumeric, dot, underscore, or hyphen characters",
    )
    .default("platform-admin"),
  ADMIN_LOCALE: z.enum(["ar", "en"]).default("ar"),
});

export type ProductionAdminEnv = z.infer<typeof ProductionAdminEnvSchema>;

export function parseProductionAdminEnv(
  rawEnv: Record<string, string | undefined>,
): ProductionAdminEnv {
  const parsed = ProductionAdminEnvSchema.safeParse({
    ADMIN_EMAIL: rawEnv.ADMIN_EMAIL,
    ADMIN_PASSWORD: rawEnv.ADMIN_PASSWORD,
    ADMIN_NAME: rawEnv.ADMIN_NAME || undefined,
    ADMIN_USERNAME: rawEnv.ADMIN_USERNAME || undefined,
    ADMIN_LOCALE: rawEnv.ADMIN_LOCALE || undefined,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid production seed environment: ${issues}`);
  }

  return parsed.data;
}

export interface SeedProductionArgs {
  allowLocal: boolean;
}

export function parseSeedProductionArgs(argv: string[]): SeedProductionArgs {
  let allowLocal = false;
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--allow-local") {
      allowLocal = true;
      continue;
    }
    throw new Error(
      `Unknown argument for production seed: ${arg}. Supported flags: --allow-local`,
    );
  }
  return { allowLocal };
}

export function assertDatabaseTargetAllowed(options: {
  databaseUrl?: string;
  directUrl?: string;
  allowLocal: boolean;
}): void {
  if (!options.databaseUrl) {
    throw new Error("Missing DATABASE_URL for production seed.");
  }

  if (options.allowLocal) {
    return;
  }

  if (isLocalHostname(options.databaseUrl)) {
    throw new Error(
      "Refusing to run production seed: DATABASE_URL host looks like localhost. Pass --allow-local to seed a local database intentionally.",
    );
  }

  if (options.directUrl && isLocalHostname(options.directUrl)) {
    throw new Error(
      "Refusing to run production seed: DIRECT_URL host looks like localhost. Pass --allow-local to seed a local database intentionally.",
    );
  }
}

export interface SeedProductionUserRecord {
  id: string;
  role: string;
  username: string;
}

export interface SeedProductionDbClient {
  user: {
    findFirst(args: {
      where: Record<string, unknown>;
      select: { id: true; role: true; username: true };
    }): Promise<SeedProductionUserRecord | null>;
    create(args: {
      data: {
        tenantId: null;
        name: string;
        role: "PLATFORM_ADMIN";
        email: string;
        username: string;
        passwordHash: string;
        pinHash: null;
        locale: "ar" | "en";
        active: true;
      };
      select: { id: true; role: true; username: true };
    }): Promise<SeedProductionUserRecord>;
  };
  auditLog: {
    create(args: {
      data: {
        tenantId: null;
        userId: string;
        action: string;
        entity: string;
        entityId: string;
        metadata: {
          source: string;
          username: string;
          locale: "ar" | "en";
          allowLocal: boolean;
        };
      };
    }): Promise<unknown>;
  };
}

export interface SeedProductionResult {
  status: "created";
  userId: string;
  role: "PLATFORM_ADMIN";
  username: string;
}

/**
 * Bootstraps ONLY the single PLATFORM_ADMIN account from runtime ADMIN_EMAIL
 * and ADMIN_PASSWORD environment variables, refusing if an admin exists or if
 * the target host looks local without --allow-local. Never logs credentials.
 */
export async function seedProductionAdmin(
  db: SeedProductionDbClient,
  rawEnv: Record<string, string | undefined>,
  options: {
    databaseUrl?: string;
    directUrl?: string;
    allowLocal?: boolean;
  } = {},
): Promise<SeedProductionResult> {
  const allowLocal = Boolean(options.allowLocal);
  assertDatabaseTargetAllowed({
    databaseUrl: options.databaseUrl ?? rawEnv.DATABASE_URL,
    directUrl: options.directUrl ?? rawEnv.DIRECT_URL,
    allowLocal,
  });

  const config = parseProductionAdminEnv(rawEnv);
  const userSelect = {
    id: true,
    role: true,
    username: true,
  } as const;

  const existingAdmin = await db.user.findFirst({
    where: { role: "PLATFORM_ADMIN" },
    select: userSelect,
  });

  if (existingAdmin) {
    throw new Error(
      "Refusing to run production seed: a PLATFORM_ADMIN account already exists.",
    );
  }

  const conflictingUser = await db.user.findFirst({
    where: {
      OR: [
        { email: config.ADMIN_EMAIL },
        { tenantId: null, username: config.ADMIN_USERNAME },
      ],
    },
    select: userSelect,
  });

  if (conflictingUser) {
    throw new Error(
      `Cannot seed PLATFORM_ADMIN: a non-admin account (${conflictingUser.id}) already uses the configured email or username.`,
    );
  }

  const created = await db.user.create({
    data: {
      tenantId: null,
      name: config.ADMIN_NAME,
      role: "PLATFORM_ADMIN",
      email: config.ADMIN_EMAIL,
      username: config.ADMIN_USERNAME,
      passwordHash: hashSecret(config.ADMIN_PASSWORD),
      pinHash: null,
      locale: config.ADMIN_LOCALE,
      active: true,
    },
    select: userSelect,
  });

  await db.auditLog.create({
    data: {
      tenantId: null,
      userId: created.id,
      action: "PLATFORM_ADMIN_BOOTSTRAPPED",
      entity: "User",
      entityId: created.id,
      metadata: {
        source: "seed.production",
        username: created.username,
        locale: config.ADMIN_LOCALE,
        allowLocal,
      },
    },
  });

  return {
    status: "created",
    userId: created.id,
    role: "PLATFORM_ADMIN",
    username: created.username,
  };
}
