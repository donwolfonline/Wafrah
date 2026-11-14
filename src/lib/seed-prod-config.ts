import { z } from "zod";
import { hashSecret } from "@/lib/password";

const FORBIDDEN_DEMO_SECRETS = new Set([
  "wafrahadmin!2026",
  "shamimanager!2026",
  "diwanmanager!2026",
  "password123456",
  "admin12345678",
]);

function isStrongBootstrapPassword(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (
    FORBIDDEN_DEMO_SECRETS.has(normalized) ||
    normalized.includes("replace-with") ||
    normalized.includes("changeme")
  ) {
    return false;
  }

  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigitOrSymbol = /[0-9]|[^A-Za-z0-9]/.test(value);
  return hasUpper && hasLower && hasDigitOrSymbol;
}

export const SeedProdEnvSchema = z.object({
  SEED_ADMIN_EMAIL: z
    .string()
    .trim()
    .toLowerCase()
    .email("SEED_ADMIN_EMAIL must be a valid email address"),
  SEED_ADMIN_PASSWORD: z
    .string()
    .min(12, "SEED_ADMIN_PASSWORD must be at least 12 characters")
    .max(128, "SEED_ADMIN_PASSWORD must be at most 128 characters")
    .refine(
      isStrongBootstrapPassword,
      "SEED_ADMIN_PASSWORD must include uppercase, lowercase, and a digit or symbol, and must not match demo/placeholder passwords",
    ),
  SEED_ADMIN_NAME: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .default("Wafrah Platform Admin"),
  SEED_ADMIN_USERNAME: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9._-]{2,31}$/,
      "SEED_ADMIN_USERNAME must be 3-32 lowercase alphanumeric, dot, underscore, or hyphen characters",
    )
    .default("platform-admin"),
  SEED_ADMIN_LOCALE: z.enum(["ar", "en"]).default("ar"),
});

export type SeedProdEnv = z.infer<typeof SeedProdEnvSchema>;

export interface SeedProdUserRecord {
  id: string;
  role: string;
  email: string | null;
  username: string;
}

export interface SeedProdDbClient {
  user: {
    findFirst(args: {
      where: Record<string, unknown>;
      select: { id: true; role: true; email: true; username: true };
    }): Promise<SeedProdUserRecord | null>;
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
      select: { id: true; role: true; email: true; username: true };
    }): Promise<SeedProdUserRecord>;
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
        };
      };
    }): Promise<unknown>;
  };
}

export type SeedProdResult =
  | {
      status: "created";
      userId: string;
      email: string | null;
      username: string;
    }
  | {
      status: "skipped";
      reason: "platform_admin_exists";
      userId: string;
      email: string | null;
      username: string;
    };

/**
 * Safely creates the single initial PLATFORM_ADMIN account in production without
 * wiping existing tables or inserting any demo restaurants, menus, or staff.
 */
export async function bootstrapProductionAdmin(
  db: SeedProdDbClient,
  rawEnv: Record<string, string | undefined>,
): Promise<SeedProdResult> {
  const parsed = SeedProdEnvSchema.safeParse({
    SEED_ADMIN_EMAIL: rawEnv.SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: rawEnv.SEED_ADMIN_PASSWORD,
    SEED_ADMIN_NAME: rawEnv.SEED_ADMIN_NAME || undefined,
    SEED_ADMIN_USERNAME: rawEnv.SEED_ADMIN_USERNAME || undefined,
    SEED_ADMIN_LOCALE: rawEnv.SEED_ADMIN_LOCALE || undefined,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid production admin bootstrap environment: ${issues}`);
  }

  const config = parsed.data;
  const userSelect = {
    id: true,
    role: true,
    email: true,
    username: true,
  } as const;

  const existingAdmin = await db.user.findFirst({
    where: { role: "PLATFORM_ADMIN" },
    select: userSelect,
  });

  if (existingAdmin) {
    return {
      status: "skipped",
      reason: "platform_admin_exists",
      userId: existingAdmin.id,
      email: existingAdmin.email,
      username: existingAdmin.username,
    };
  }

  const conflictingUser = await db.user.findFirst({
    where: {
      OR: [
        { email: config.SEED_ADMIN_EMAIL },
        { tenantId: null, username: config.SEED_ADMIN_USERNAME },
      ],
    },
    select: userSelect,
  });

  if (conflictingUser) {
    throw new Error(
      `Cannot bootstrap platform admin: email or username already belongs to non-admin user ${conflictingUser.id}.`,
    );
  }

  const created = await db.user.create({
    data: {
      tenantId: null,
      name: config.SEED_ADMIN_NAME,
      role: "PLATFORM_ADMIN",
      email: config.SEED_ADMIN_EMAIL,
      username: config.SEED_ADMIN_USERNAME,
      passwordHash: hashSecret(config.SEED_ADMIN_PASSWORD),
      pinHash: null,
      locale: config.SEED_ADMIN_LOCALE,
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
        source: "seed-prod",
        username: created.username,
        locale: config.SEED_ADMIN_LOCALE,
      },
    },
  });

  return {
    status: "created",
    userId: created.id,
    email: created.email,
    username: created.username,
  };
}
