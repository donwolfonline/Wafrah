export interface AuthHostEnvSource {
  AUTH_TRUST_HOST?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
  APP_URL?: string;
}

/**
 * Resolves Auth.js `trustHost` behind Vercel and reverse proxies.
 * Defaults to `true` across local dev, Vercel Preview, and HTTPS Production
 * unless explicitly disabled via `AUTH_TRUST_HOST="false"`.
 */
export function shouldTrustAuthHost(source: AuthHostEnvSource): boolean {
  if (source.AUTH_TRUST_HOST === "false") {
    return false;
  }
  return true;
}

export interface SafeAuthRedirectInput {
  url: string;
  baseUrl: string;
  allowedOrigins?: ReadonlyArray<string | undefined | null>;
}

function normalizeHttpOrigin(candidate: string): string | null {
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Restricts Auth.js post-login/logout redirects to relative same-site paths
 * (excluding protocol-relative `//host`) or known canonical application origins.
 */
export function resolveSafeAuthRedirectUrl({
  url,
  baseUrl,
  allowedOrigins = [],
}: SafeAuthRedirectInput): string {
  const safeBaseUrl = normalizeHttpOrigin(baseUrl) ?? "http://localhost:3000";

  if (typeof url !== "string" || url.length === 0) {
    return safeBaseUrl;
  }

  if (url.startsWith("/")) {
    if (url.startsWith("//") || url.startsWith("/\\")) {
      return safeBaseUrl;
    }
    return new URL(url, safeBaseUrl).toString();
  }

  try {
    const parsedTarget = new URL(url);
    if (
      parsedTarget.protocol !== "http:" &&
      parsedTarget.protocol !== "https:"
    ) {
      return safeBaseUrl;
    }

    const trustedOrigins = new Set<string>([safeBaseUrl]);
    for (const candidate of allowedOrigins) {
      if (!candidate) continue;
      const origin = normalizeHttpOrigin(candidate);
      if (origin) {
        trustedOrigins.add(origin);
      }
    }

    if (trustedOrigins.has(parsedTarget.origin)) {
      return parsedTarget.toString();
    }
  } catch {
    return safeBaseUrl;
  }

  return safeBaseUrl;
}
