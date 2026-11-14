import { env as runtimeEnv } from "@/env";

const DEFAULT_APP_ORIGIN = "http://localhost:3000";

export type AppUrlEnv = {
  APP_URL?: string | undefined;
  NEXT_PUBLIC_SITE_URL?: string | undefined;
  VERCEL_ENV?: string | undefined;
  VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
  VERCEL_URL?: string | undefined;
};

function parseOriginCandidate(raw: string | undefined): URL | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.startsWith("localhost") || trimmed.startsWith("127.0.0.1")
      ? `http://${trimmed}`
      : `https://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return new URL(parsed.origin);
  } catch {
    return null;
  }
}

export function resolveAppOrigin(options?: {
  overrideUrl?: string;
  preferPublicSiteUrl?: boolean;
  env?: AppUrlEnv;
}): URL {
  const env = options?.env ?? runtimeEnv;
  const isPreview = env.VERCEL_ENV?.trim() === "preview";

  const candidates: Array<string | undefined> = [
    options?.overrideUrl,
    ...(options?.preferPublicSiteUrl
      ? [
          env.NEXT_PUBLIC_SITE_URL,
          env.APP_URL,
          isPreview ? env.VERCEL_URL : undefined,
          env.VERCEL_PROJECT_PRODUCTION_URL,
          env.VERCEL_URL,
        ]
      : [
          env.APP_URL,
          isPreview ? env.VERCEL_URL : undefined,
          env.NEXT_PUBLIC_SITE_URL,
          env.VERCEL_PROJECT_PRODUCTION_URL,
          env.VERCEL_URL,
        ]),
  ];

  for (const candidate of candidates) {
    const parsed = parseOriginCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return new URL(DEFAULT_APP_ORIGIN);
}

/**
 * Returns the canonical public site origin for SEO metadata, sitemaps,
 * Open Graph tags, and JSON-LD. Honors explicit public URL config first,
 * then falls back to Vercel's runtime deployment hostnames.
 */
export function getPublicSiteBaseUrl(env?: AppUrlEnv): URL {
  return resolveAppOrigin({ preferPublicSiteUrl: true, env });
}

/**
 * Returns the base origin string (no trailing slash) for server-generated
 * links in emails, reports, and notifications.
 */
export function getServerAppUrl(overrideUrl?: string, env?: AppUrlEnv): string {
  return resolveAppOrigin({ overrideUrl, preferPublicSiteUrl: false, env }).origin;
}

/**
 * Returns true when running in Vercel production (`VERCEL_ENV === "production"`)
 * or standard Node production (`NODE_ENV === "production"`).
 */
export function isProductionRuntime(
  env: {
    VERCEL_ENV?: string | undefined;
    NODE_ENV?: string | undefined;
  } = runtimeEnv,
): boolean {
  return env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
}
