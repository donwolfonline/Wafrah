import { execFileSync } from "node:child_process";

function runStep(command, args, envOverrides = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...envOverrides,
    },
  });
}

function shouldSkipMigrations() {
  const flag = (process.env.SKIP_MIGRATE_DEPLOY ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true";
}

function main() {
  runStep("pnpm", ["exec", "prisma", "generate"]);

  if (shouldSkipMigrations()) {
    console.log(
      JSON.stringify({
        event: "VERCEL_BUILD_MIGRATIONS_SKIPPED",
        reason: "SKIP_MIGRATE_DEPLOY enabled",
      }),
    );
  } else {
    const migrationDatabaseUrl =
      process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!migrationDatabaseUrl) {
      throw new Error(
        "Missing DIRECT_URL or DATABASE_URL for prisma migrate deploy during Vercel build.",
      );
    }

    runStep("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      DATABASE_URL: migrationDatabaseUrl,
    });
  }

  runStep("pnpm", ["exec", "next", "build", "--webpack"]);
}

main();
