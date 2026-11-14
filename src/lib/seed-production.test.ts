import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { verifySecret } from "./password";
import {
  assertDatabaseTargetAllowed,
  parseSeedProductionArgs,
  seedProductionAdmin,
  type SeedProductionDbClient,
  type SeedProductionUserRecord,
} from "./seed-production";

interface FakeUserRow extends SeedProductionUserRecord {
  email: string;
}

function createFakeSeedDb(initialUsers: FakeUserRow[] = []) {
  const users: FakeUserRow[] = [...initialUsers];
  const auditLogs: Array<Record<string, unknown>> = [];
  let createdPasswordHash: string | null = null;

  const db: SeedProductionDbClient = {
    user: {
      async findFirst({ where }) {
        if (where.role === "PLATFORM_ADMIN") {
          return users.find((u) => u.role === "PLATFORM_ADMIN") ?? null;
        }
        const orClauses = (where.OR as Array<Record<string, unknown>>) ?? [];
        return (
          users.find((u) =>
            orClauses.some(
              (c) =>
                (typeof c.email === "string" && u.email === c.email) ||
                (typeof c.username === "string" && u.username === c.username),
            ),
          ) ?? null
        );
      },
      async create({ data }) {
        createdPasswordHash = data.passwordHash;
        const created: FakeUserRow = {
          id: `usr_${users.length + 1}`,
          role: data.role,
          email: data.email,
          username: data.username,
        };
        users.push(created);
        return { id: created.id, role: created.role, username: created.username };
      },
    },
    auditLog: {
      async create({ data }) {
        auditLogs.push(data);
        return data;
      },
    },
  };

  return { db, users, auditLogs, getCreatedPasswordHash: () => createdPasswordHash };
}

function runTsxCli(
  args: string[],
  envOverrides: Record<string, string | undefined> & {
    NODE_ENV?: "development" | "production" | "test";
  },
): { status: number; stdout: string; stderr: string } {
  try {
    const childEnv: NodeJS.ProcessEnv = {
      NODE_ENV: envOverrides.NODE_ENV ?? "test",
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ...envOverrides,
    };
    const stdout = execFileSync("./node_modules/.bin/tsx", args, {
      env: childEnv,
      stdio: "pipe",
      encoding: "utf8",
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const err = error as {
      status?: number;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    return {
      status: err.status ?? 1,
      stdout: typeof err.stdout === "string" ? err.stdout : (err.stdout?.toString("utf8") ?? ""),
      stderr: typeof err.stderr === "string" ? err.stderr : (err.stderr?.toString("utf8") ?? ""),
    };
  }
}

const REMOTE_DB_URL =
  "postgresql://wafrah:pass@ep-cool-host.eu-central-1.aws.neon.tech/wafrah?sslmode=require";

describe("production seed & demo seed safety", () => {
  it("parses --allow-local flag cleanly and rejects unknown flags", () => {
    expect(parseSeedProductionArgs([])).toEqual({ allowLocal: false });
    expect(parseSeedProductionArgs(["--allow-local"])).toEqual({ allowLocal: true });
    expect(parseSeedProductionArgs(["--", "--allow-local"])).toEqual({ allowLocal: true });
    expect(() => parseSeedProductionArgs(["--allow_local"])).toThrow(/Unknown argument/);
  });

  it("refuses localhost DATABASE_URL or DIRECT_URL hosts unless --allow-local is set", () => {
    for (const localUrl of [
      "postgresql://localhost:5432/wafrah_dev",
      "postgresql://user:pass@127.0.0.1:5432/wafrah_dev",
      "postgresql://user:pass@[::1]:5432/wafrah_dev",
      "postgresql://user:pass@0.0.0.0:5432/wafrah_dev",
      "postgresql://user:pass@db.localhost:5432/wafrah_dev",
    ]) {
      expect(() =>
        assertDatabaseTargetAllowed({ databaseUrl: localUrl, allowLocal: false }),
      ).toThrow(/--allow-local/);
      expect(() =>
        assertDatabaseTargetAllowed({ databaseUrl: localUrl, allowLocal: true }),
      ).not.toThrow();
    }

    expect(() =>
      assertDatabaseTargetAllowed({
        databaseUrl: REMOTE_DB_URL,
        directUrl: "postgresql://localhost:5432/wafrah_dev",
        allowLocal: false,
      }),
    ).toThrow(/DIRECT_URL/);
  });

  it("creates ONLY one PLATFORM_ADMIN with a hashed password and omits credentials from output & audit logs", async () => {
    const fake = createFakeSeedDb();
    const adminEmail = "OpsLead@WafrahPilot.sa";
    const adminPassword = "Pilot#StrongPassword99";

    const result = await seedProductionAdmin(
      fake.db,
      {
        ADMIN_EMAIL: adminEmail,
        ADMIN_PASSWORD: adminPassword,
        ADMIN_NAME: "Pilot Platform Admin",
        ADMIN_LOCALE: "en",
      },
      { databaseUrl: REMOTE_DB_URL },
    );

    expect(result).toEqual({
      status: "created",
      userId: "usr_1",
      role: "PLATFORM_ADMIN",
      username: "platform-admin",
    });
    expect(fake.users).toHaveLength(1);
    expect(fake.users[0]?.email).toBe("opslead@wafrahpilot.sa");
    expect(fake.users[0]?.role).toBe("PLATFORM_ADMIN");
    expect(verifySecret(adminPassword, fake.getCreatedPasswordHash()!)).toBe(true);
    expect(fake.auditLogs).toHaveLength(1);
    expect(fake.auditLogs[0]?.action).toBe("PLATFORM_ADMIN_BOOTSTRAPPED");

    const serialized = JSON.stringify({ result, auditLogs: fake.auditLogs });
    expect(serialized).not.toContain("opslead@wafrahpilot.sa");
    expect(serialized).not.toContain(adminPassword);
  });

  it("refuses to run when any PLATFORM_ADMIN already exists without mutating the database", async () => {
    const fake = createFakeSeedDb([
      { id: "existing-admin", role: "PLATFORM_ADMIN", email: "ops@wafrah.sa", username: "platform-admin" },
    ]);

    await expect(
      seedProductionAdmin(
        fake.db,
        { ADMIN_EMAIL: "new@wafrah.sa", ADMIN_PASSWORD: "Another#StrongPassword99" },
        { databaseUrl: REMOTE_DB_URL },
      ),
    ).rejects.toThrow(/PLATFORM_ADMIN account already exists/);

    expect(fake.users).toHaveLength(1);
    expect(fake.auditLogs).toHaveLength(0);
  });

  it("rejects missing, weak, or demo passwords and never echoes email or password in errors", async () => {
    const fake = createFakeSeedDb();
    const leakedEmail = "secret.founder@wafrah.sa";
    const weakShort = "TooShort1!";

    let caughtMessage = "";
    try {
      await seedProductionAdmin(
        fake.db,
        { ADMIN_EMAIL: leakedEmail, ADMIN_PASSWORD: weakShort },
        { databaseUrl: REMOTE_DB_URL },
      );
    } catch (error) {
      caughtMessage = error instanceof Error ? error.message : String(error);
    }

    expect(caughtMessage).toContain("ADMIN_PASSWORD");
    expect(caughtMessage).not.toContain(weakShort);
    expect(caughtMessage).not.toContain(leakedEmail);

    await expect(
      seedProductionAdmin(fake.db, {}, { databaseUrl: REMOTE_DB_URL }),
    ).rejects.toThrow(/ADMIN_EMAIL.*ADMIN_PASSWORD/);

    await expect(
      seedProductionAdmin(
        fake.db,
        { ADMIN_EMAIL: "admin@wafrah.sa", ADMIN_PASSWORD: "WafrahAdmin!2026" },
        { databaseUrl: REMOTE_DB_URL },
      ),
    ).rejects.toThrow(/ADMIN_PASSWORD/);
  });

  it("refuses if target email or username belongs to a non-admin account without leaking the email", async () => {
    const conflictEmail = "ops.manager@wafrah.sa";
    const fake = createFakeSeedDb([
      { id: "mgr_1", role: "MANAGER", email: conflictEmail, username: "manager" },
    ]);

    let message = "";
    try {
      await seedProductionAdmin(
        fake.db,
        { ADMIN_EMAIL: conflictEmail, ADMIN_PASSWORD: "Pilot#StrongPassword99" },
        { databaseUrl: REMOTE_DB_URL },
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("non-admin account (mgr_1)");
    expect(message).not.toContain(conflictEmail);
  });

  it("refuses localhost via CLI without --allow-local and rejects missing ADMIN_EMAIL/ADMIN_PASSWORD without leaking values", () => {
    const secretEmail = "cli-admin@wafrah.sa";
    const secretPassword = "Cli#StrongPassword99";
    const localRefusal = runTsxCli(["prisma/seed.production.ts"], {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost:5432/wafrah_dev",
      ADMIN_EMAIL: secretEmail,
      ADMIN_PASSWORD: secretPassword,
    });
    expect(localRefusal.status).not.toBe(0);
    expect(localRefusal.stderr).toContain("--allow-local");
    expect(localRefusal.stdout + localRefusal.stderr).not.toContain(secretEmail);
    expect(localRefusal.stdout + localRefusal.stderr).not.toContain(secretPassword);

    const missingCreds = runTsxCli(["prisma/seed.production.ts"], {
      NODE_ENV: "production",
      DATABASE_URL: REMOTE_DB_URL,
    });
    expect(missingCreds.status).not.toBe(0);
    expect(missingCreds.stderr).toContain("ADMIN_EMAIL");
    expect(missingCreds.stderr).toContain("ADMIN_PASSWORD");
  });

  it("blocks prisma/seed.ts when either NODE_ENV=production or VERCEL_ENV=production", () => {
    for (const envCase of [
      { NODE_ENV: "production", VERCEL_ENV: undefined },
      { NODE_ENV: "development", VERCEL_ENV: "production" },
    ] as const) {
      const outcome = runTsxCli(["prisma/seed.ts"], envCase);
      expect(outcome.status).not.toBe(0);
      expect(outcome.stderr).toContain(
        "Refusing to run destructive demo seed in production",
      );
    }
  });
});
