import { PrismaClient } from "@prisma/client";

export function resolveDatabaseUrl(
  rawUrl?: string,
  fallbackUsername?: string,
): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.username) {
      parsed.username = fallbackUsername || "postgres";
      return parsed.toString();
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export function createPlatformPrismaClient(options: {
  databaseUrl?: string;
  fallbackUsername?: string;
  nodeEnv?: string;
}): PrismaClient {
  const resolvedUrl = resolveDatabaseUrl(
    options.databaseUrl,
    options.fallbackUsername,
  );
  return new PrismaClient({
    ...(resolvedUrl ? { datasources: { db: { url: resolvedUrl } } } : {}),
    log: options.nodeEnv === "development" ? ["error", "warn"] : ["error"],
  });
}
