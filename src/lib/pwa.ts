import { env as runtimeEnv } from "@/env";
import { SW_CACHE_PREFIX } from "./pwa-constants";

export { SW_CACHE_PREFIX };

export const STATIC_PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
] as const;

export const AUTHENTICATED_ROUTE_PREFIXES = [
  "/log",
  "/dashboard",
  "/admin",
  "/menu",
  "/imports",
  "/reports",
  "/settings",
  "/login",
  "/design-check",
  "/help",
] as const;

const CACHEABLE_PUBLIC_ASSET_EXT_REGEX =
  /\.(?:png|jpg|jpeg|webp|svg|ico|woff2)$/i;

/**
 * Resolves the build identifier baked into the build or provided by Vercel.
 */
export function resolveBuildId(env?: {
  WAFRAH_BUILD_ID?: string | undefined;
  VERCEL_DEPLOYMENT_ID?: string | undefined;
  VERCEL_GIT_COMMIT_SHA?: string | undefined;
}): string {
  const wafrahBuildId =
    env !== undefined ? env.WAFRAH_BUILD_ID : runtimeEnv.WAFRAH_BUILD_ID;
  const vercelDeploymentId =
    env !== undefined
      ? env.VERCEL_DEPLOYMENT_ID
      : runtimeEnv.VERCEL_DEPLOYMENT_ID;
  const vercelGitSha =
    env !== undefined
      ? env.VERCEL_GIT_COMMIT_SHA
      : runtimeEnv.VERCEL_GIT_COMMIT_SHA;

  const candidate =
    wafrahBuildId?.trim() ||
    vercelDeploymentId?.trim() ||
    vercelGitSha?.trim() ||
    "dev";

  return candidate.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 48) || "dev";
}

/**
 * Computes the build-versioned CacheStorage name for Wafrah's service worker.
 */
export function buildSwCacheName(buildId: string): string {
  const safeBuildId =
    buildId
      .trim()
      .replace(/[^A-Za-z0-9._-]/g, "")
      .slice(0, 48) || "dev";
  return `${SW_CACHE_PREFIX}${safeBuildId}`;
}

/**
 * Pure cacheability policy mirrored inside `/sw.js`:
 * - NEVER caches non-GET requests, cross-origin requests, `/api/*` responses,
 *   `/sw.js` itself, HTML/navigation requests, RSC requests, or authenticated pages.
 * - ONLY caches immutable Next.js static bundles, the web manifest, and static public media/fonts.
 */
export function isCacheableSwRequest(params: {
  method: string;
  requestUrl: string;
  origin: string;
  mode?: string;
  acceptHeader?: string;
  hasRscHeader?: boolean;
  buildId?: string;
}): boolean {
  if (params.method.toUpperCase() !== "GET") {
    return false;
  }
  if (params.mode === "navigate") {
    return false;
  }
  if (params.hasRscHeader) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(params.requestUrl, params.origin);
  } catch {
    return false;
  }

  if (parsed.origin !== params.origin) {
    return false;
  }

  const pathname = parsed.pathname;
  if (
    pathname === "/sw.js" ||
    pathname.startsWith("/api/") ||
    pathname === "/api" ||
    parsed.searchParams.has("_rsc")
  ) {
    return false;
  }

  for (const prefix of AUTHENTICATED_ROUTE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return false;
    }
  }

  if (
    params.acceptHeader &&
    params.acceptHeader.toLowerCase().includes("text/html")
  ) {
    return false;
  }

  if (pathname.startsWith("/_next/static/")) {
    return params.buildId !== "dev";
  }

  if (
    pathname === "/manifest.webmanifest" ||
    pathname === "/manifest.json" ||
    pathname === "/favicon.ico"
  ) {
    return true;
  }

  return CACHEABLE_PUBLIC_ASSET_EXT_REGEX.test(pathname);
}

/**
 * Generates the service worker JavaScript payload versioned with `buildId`.
 * Does NOT call `self.skipWaiting()` on install so updates activate on next launch
 * without disrupting active sessions or wiping IndexedDB queues.
 */
export function generateServiceWorkerScript(buildId: string): string {
  const cacheName = buildSwCacheName(buildId);
  const isDevBuild = buildId === "dev";

  return `// Build ID: ${buildId}
const CACHE_NAME = ${JSON.stringify(cacheName)};
const CACHE_PREFIX = ${JSON.stringify(SW_CACHE_PREFIX)};
const IS_DEV_BUILD = ${JSON.stringify(isDevBuild)};
const PRECACHE_URLS = ${JSON.stringify([...STATIC_PRECACHE_URLS])};
const AUTH_PREFIXES = ${JSON.stringify([...AUTHENTICATED_ROUTE_PREFIXES])};
const ASSET_EXT_REGEX = /\\.(?:png|jpg|jpeg|webp|svg|ico|woff2)$/i;

function isCacheableAsset(request) {
  if (request.method !== "GET" || request.mode === "navigate") {
    return false;
  }
  if (request.headers.get("rsc") === "1") {
    return false;
  }
  const accept = request.headers.get("accept") || "";
  if (accept.toLowerCase().includes("text/html")) {
    return false;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }
  if (
    url.pathname === "/sw.js" ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.searchParams.has("_rsc")
  ) {
    return false;
  }
  for (const prefix of AUTH_PREFIXES) {
    if (url.pathname === prefix || url.pathname.startsWith(prefix + "/")) {
      return false;
    }
  }
  if (url.pathname.startsWith("/_next/static/")) {
    return !IS_DEV_BUILD;
  }
  if (
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/favicon.ico"
  ) {
    return true;
  }
  return ASSET_EXT_REGEX.test(url.pathname);
}

self.addEventListener("install", (event) => {
  if (IS_DEV_BUILD) {
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(CACHE_PREFIX) &&
                (IS_DEV_BUILD || key !== CACHE_NAME),
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  if (!isCacheableAsset(event.request)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) {
        return cached;
      }
      const response = await fetch(event.request);
      if (
        response &&
        response.ok &&
        response.type === "basic" &&
        !response.headers.get("set-cookie")
      ) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    }),
  );
});
`;
}

export function buildWebManifest(locale: "ar" | "en") {
  const isAr = locale === "ar";

  return {
    id: "/",
    name: isAr
      ? "وفرة — Wafrah لإدارة الهدر الغذائي"
      : "Wafrah — وفرة Food Waste Management",
    short_name: "Wafrah وفرة",
    description: isAr
      ? "منصة ذكية لتسجيل الهدر الغذائي في المطبخ في أقل من 10 ثوانٍ للمطاعم والفنادق في المملكة العربية السعودية"
      : "Fast offline-first kitchen food waste logging and analytics for restaurants and hotels in Saudi Arabia",
    start_url: "/log",
    scope: "/",
    display: "standalone" as const,
    orientation: "any" as const,
    dir: (isAr ? "rtl" : "ltr") as "rtl" | "ltr",
    lang: locale,
    background_color: "#F2F8F6",
    theme_color: "#0B4F45",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any" as const,
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any" as const,
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable" as const,
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any" as const,
      },
    ],
  };
}
