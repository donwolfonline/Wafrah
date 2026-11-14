import { existsSync } from "node:fs";
import path from "node:path";
import { parseSeedCliEnv } from "../src/env.core";
import { createPlatformPrismaClient } from "../src/lib/db-factory";
import {
  assertDatabaseTargetAllowed,
  parseProductionAdminEnv,
  parseSeedProductionArgs,
  seedProductionAdmin,
} from "../src/lib/seed-production";

function loadLocalEnvIfUnset(): void {
  const isProdRuntime =
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production";
  if (isProdRuntime || process.env.DATABASE_URL) {
    return;
  }
  const envPath = path.resolve(process.cwd(), ".env");
  if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }
}

async function main() {
  const { allowLocal } = parseSeedProductionArgs(process.argv.slice(2));
  loadLocalEnvIfUnset();

  const { config, rawSeedEnv } = parseSeedCliEnv();
  assertDatabaseTargetAllowed({
    databaseUrl: config.DATABASE_URL,
    directUrl: config.DIRECT_URL,
    allowLocal,
  });
  parseProductionAdminEnv(rawSeedEnv);

  const prisma = createPlatformPrismaClient({
    databaseUrl: config.DIRECT_URL ?? config.DATABASE_URL,
    fallbackUsername: config.USER ?? config.LOGNAME,
    nodeEnv: config.NODE_ENV,
  });

  try {
    const result = await seedProductionAdmin(prisma, rawSeedEnv, {
      databaseUrl: config.DATABASE_URL,
      directUrl: config.DIRECT_URL,
      allowLocal,
    });
    console.log(
      JSON.stringify({
        event: "SEED_PRODUCTION_COMPLETED",
        ...result,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown production seed error";
  console.error(
    JSON.stringify({
      event: "SEED_PRODUCTION_FAILED",
      message,
    }),
  );
  process.exit(1);
});
