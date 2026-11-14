import type { Redirect } from "next/dist/lib/load-custom-routes";

export interface DomainEnvSource {
  NEXT_PUBLIC_SITE_URL?: string;
  APP_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
}

export interface CanonicalHostRedirectSpec {
  sourceHost: string;
  canonicalHost: string;
  destinationOrigin: string;
}

const MULTI_LABEL_CCSIDS = new Set(["com", "net", "org", "co", "gov", "edu"]);

export function isVercelProductionEnv(
  source: Pick<DomainEnvSource, "VERCEL_ENV">,
): boolean {
  return source.VERCEL_ENV === "production";
}

function isLocalOrPreviewHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".vercel.app") ||
    normalized.includes(":") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)
  ) {
    return true;
  }
  return false;
}

function isApexDomain(hostname: string): boolean {
  const labels = hostname.split(".").filter(Boolean);
  if (labels.length === 2) {
    return true;
  }
  return (
    labels.length === 3 &&
    MULTI_LABEL_CCSIDS.has(labels[1] ?? "") &&
    (labels[2]?.length ?? 0) === 2
  );
}

/**
 * Computes a permanent `www <-> apex` host redirect derived solely from
 * the canonical origin in `NEXT_PUBLIC_SITE_URL`.
 *
 * - Canonical `https://wafrah.sa` -> redirects `www.wafrah.sa` -> `https://wafrah.sa`
 * - Canonical `https://www.wafrah.sa` -> redirects `wafrah.sa` -> `https://www.wafrah.sa`
 * - Custom subdomains (e.g. `app.wafrah.sa`), `*.vercel.app`, and `localhost` return `null`.
 */
export function buildCanonicalHostRedirectSpec(
  canonicalSiteUrl: string,
): CanonicalHostRedirectSpec | null {
  let parsed: URL;
  try {
    parsed = new URL(canonicalSiteUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  const canonicalHost = parsed.hostname.toLowerCase();
  if (isLocalOrPreviewHostname(canonicalHost)) {
    return null;
  }

  if (canonicalHost.startsWith("www.")) {
    const apexHost = canonicalHost.slice(4);
    if (!apexHost.includes(".")) {
      return null;
    }
    return {
      sourceHost: apexHost,
      canonicalHost,
      destinationOrigin: parsed.origin,
    };
  }

  if (!isApexDomain(canonicalHost)) {
    return null;
  }

  return {
    sourceHost: `www.${canonicalHost}`,
    canonicalHost,
    destinationOrigin: parsed.origin,
  };
}

/**
 * Generates Next.js `redirects()` entries matching `www` <-> apex for the
 * canonical HTTPS production domain. Disabled cleanly on Preview/Development.
 */
export function buildNextConfigCanonicalRedirects(
  envSource: DomainEnvSource,
): Redirect[] {
  if (
    envSource.VERCEL_ENV === "preview" ||
    envSource.VERCEL_ENV === "development"
  ) {
    return [];
  }

  if (!envSource.NEXT_PUBLIC_SITE_URL) {
    return [];
  }

  let canonicalOrigin: string;
  try {
    canonicalOrigin = new URL(envSource.NEXT_PUBLIC_SITE_URL.trim()).origin;
  } catch {
    return [];
  }

  const spec = buildCanonicalHostRedirectSpec(canonicalOrigin);
  if (!spec) {
    return [];
  }

  return [
    {
      source: "/:path*",
      has: [{ type: "host", value: spec.sourceHost }],
      destination: `${spec.destinationOrigin}/:path*`,
      permanent: true,
    },
  ];
}
