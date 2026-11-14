import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

const envPath = path.resolve(process.cwd(), ".env");
if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

function isLocalUnpooledDatabaseUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const isLocalHost =
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host.startsWith("127.");
    const isPooled =
      host.includes("-pooler") ||
      parsed.port === "6543" ||
      parsed.searchParams.get("pgbouncer") === "true";
    return isLocalHost && !isPooled;
  } catch {
    return false;
  }
}

// Local development often omits DIRECT_URL when DATABASE_URL is a direct local instance.
// Never fall back on Vercel builds, production shells, or pooled/remote connection strings.
if (
  !process.env.DIRECT_URL &&
  process.env.DATABASE_URL &&
  process.env.VERCEL !== "1" &&
  process.env.NODE_ENV !== "production" &&
  isLocalUnpooledDatabaseUrl(process.env.DATABASE_URL)
) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
