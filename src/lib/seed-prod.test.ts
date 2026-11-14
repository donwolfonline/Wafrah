import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { verifySecret } from "@/lib/password";
import {
  bootstrapProductionAdmin,
  type SeedProdDbClient,
  type SeedProdUserRecord,
} from "@/lib/seed-prod-config";

function createFakeSeedDb(initialUsers: SeedProdUserRecord[] = []) {
  const users = [...initialUsers];
  const auditLogs: Array<{
    tenantId: null;
    userId: string;
    action: string;
    entity: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }> = [];
  let createdPayload: { passwordHash: string } | null = null;

  const db: SeedProdDbClient = {
    user: {
      async findFirst({ where }) {
        if (where.role === "PLATFORM_ADMIN") {
          return users.find((u) => u.role === "PLATFORM_ADMIN") ?? null;
        }
        const orClauses = Array.isArray(where.OR)
          ? (where.OR as Array<Record<string, unknown>>)
          : [];
        for (const clause of orClauses) {
          if (typeof clause.email === "string") {
            const match = users.find((u) => u.email === clause.email);
            if (match) return match;
          }
          if (typeof clause.username === "string") {
            const match = users.find((u) => u.username === clause.username);
            if (match) return match;
          }
        }
        return null;
      },
      async create({ data }) {
        createdPayload = { passwordHash: data.passwordHash };
        const created: SeedProdUserRecord = {
          id: `usr_${users.length + 1}`,
          role: data.role,
          email: data.email,
          username: data.username,
        };
        users.push(created);
        return created;
      },
    },
    auditLog: {
      async create({ data }) {
        auditLogs.push(data);
        return data;
      },
    },
  };

  return {
    db,
    users,
    auditLogs,
    getCreatedPasswordHash: () => createdPayload?.passwordHash ?? null,
  };
}

describe("bootstrapProductionAdmin", () => {
  it("creates a single PLATFORM_ADMIN with a hashed password and audit log", async () => {
    const fake = createFakeSeedDb();
    const result = await bootstrapProductionAdmin(fake.db, {
      SEED_ADMIN_EMAIL: "Admin@WafrahPilot.sa",
      SEED_ADMIN_PASSWORD: "Pilot#StrongPassword99",
      SEED_ADMIN_NAME: "Pilot Platform Admin",
      SEED_ADMIN_LOCALE: "en",
    });

    expect(result).toEqual({
      status: "created",
      userId: "usr_1",
      email: "admin@wafrahpilot.sa",
      username: "platform-admin",
    });
    expect(fake.users).toHaveLength(1);
    expect(fake.users[0]?.role).toBe("PLATFORM_ADMIN");
    expect(
      verifySecret("Pilot#StrongPassword99", fake.getCreatedPasswordHash()!),
    ).toBe(true);
    expect(fake.auditLogs).toHaveLength(1);
    expect(fake.auditLogs[0]?.action).toBe("PLATFORM_ADMIN_BOOTSTRAPPED");
  });

  it("is idempotent when a PLATFORM_ADMIN already exists", async () => {
    const fake = createFakeSeedDb([
      {
        id: "existing-admin",
        role: "PLATFORM_ADMIN",
        email: "ops@wafrah.sa",
        username: "platform-admin",
      },
    ]);

    const result = await bootstrapProductionAdmin(fake.db, {
      SEED_ADMIN_EMAIL: "new@wafrah.sa",
      SEED_ADMIN_PASSWORD: "Another#StrongPassword99",
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "platform_admin_exists",
      userId: "existing-admin",
      email: "ops@wafrah.sa",
      username: "platform-admin",
    });
    expect(fake.users).toHaveLength(1);
    expect(fake.auditLogs).toHaveLength(0);
  });

  it("rejects demo/weak passwords and never echoes the password in errors", async () => {
    const fake = createFakeSeedDb();
    await expect(
      bootstrapProductionAdmin(fake.db, {
        SEED_ADMIN_EMAIL: "admin@wafrah.sa",
        SEED_ADMIN_PASSWORD: "WafrahAdmin!2026",
      }),
    ).rejects.toThrow(/Invalid production admin bootstrap environment/);

    await expect(
      bootstrapProductionAdmin(fake.db, {
        SEED_ADMIN_EMAIL: "admin@wafrah.sa",
        SEED_ADMIN_PASSWORD: "short",
      }),
    ).rejects.not.toThrow(/short/);
  });

  it("refuses if target email already belongs to a non-admin account", async () => {
    const fake = createFakeSeedDb([
      {
        id: "mgr_1",
        role: "MANAGER",
        email: "ops@wafrah.sa",
        username: "manager",
      },
    ]);

    await expect(
      bootstrapProductionAdmin(fake.db, {
        SEED_ADMIN_EMAIL: "ops@wafrah.sa",
        SEED_ADMIN_PASSWORD: "Pilot#StrongPassword99",
      }),
    ).rejects.toThrow(/non-admin user mgr_1/);
  });

  it("guards prisma/seed.ts from executing when NODE_ENV is production", () => {
    let stderr = "";
    let exitStatus = 0;
    try {
      execFileSync("./node_modules/.bin/tsx", ["prisma/seed.ts"], {
        env: {
          ...process.env,
          NODE_ENV: "production",
        },
        stdio: "pipe",
      });
    } catch (error) {
      const err = error as { status?: number; stderr?: Buffer };
      exitStatus = err.status ?? 1;
      stderr = err.stderr?.toString("utf8") ?? "";
    }

    expect(exitStatus).not.toBe(0);
    expect(stderr).toContain(
      "Refusing to run destructive demo seed in production",
    );
  });
});
