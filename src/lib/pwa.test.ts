import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as swRouteGet } from "@/app/sw.js/route";
import {
  buildSwCacheName,
  buildWebManifest,
  generateServiceWorkerScript,
  isCacheableSwRequest,
  STATIC_PRECACHE_URLS,
} from "./pwa";

describe("PWA service worker policy & next-launch update behavior", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("versions CACHE_NAME from build ID and serves /sw.js with Cache-Control: no-cache", async () => {
    vi.stubEnv("WAFRAH_BUILD_ID", "release-2026-11-15");
    const response = await swRouteGet();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/javascript",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-cache");

    const script = await response.text();
    expect(script).toContain(buildSwCacheName("release-2026-11-15"));
    expect(script).not.toContain("skipWaiting(");
    expect(script).toContain('"/api/"');
  });

  it("never caches authenticated pages, navigation HTML, RSC streams, or /api/* responses", () => {
    const origin = "https://wafrah.sa";
    const blockedCases = [
      { method: "GET", requestUrl: `${origin}/api/waste-entries` },
      { method: "GET", requestUrl: `${origin}/api/dashboard` },
      { method: "POST", requestUrl: `${origin}/_next/static/app.js` },
      { method: "GET", requestUrl: `${origin}/dashboard` },
      { method: "GET", requestUrl: `${origin}/log` },
      { method: "GET", requestUrl: `${origin}/admin/leads` },
      { method: "GET", requestUrl: `${origin}/menu` },
      { method: "GET", requestUrl: `${origin}/imports` },
      { method: "GET", requestUrl: `${origin}/reports/2026-11` },
      { method: "GET", requestUrl: `${origin}/settings/staff` },
      { method: "GET", requestUrl: `${origin}/login` },
      { method: "GET", requestUrl: `${origin}/sw.js` },
      {
        method: "GET",
        requestUrl: `${origin}/`,
        mode: "navigate",
        acceptHeader: "text/html",
      },
      {
        method: "GET",
        requestUrl: `${origin}/en?_rsc=xyz`,
        hasRscHeader: true,
      },
      {
        method: "GET",
        requestUrl: "https://evil.example.com/_next/static/chunk.js",
      },
    ];

    for (const c of blockedCases) {
      expect(isCacheableSwRequest({ origin, ...c })).toBe(false);
    }

    const allowedUrls = [
      `${origin}/_next/static/chunks/main-123.js`,
      `${origin}/manifest.webmanifest`,
      `${origin}/icon-192.png`,
      `${origin}/icon-512.png`,
      `${origin}/icon.svg`,
    ];
    for (const requestUrl of allowedUrls) {
      expect(
        isCacheableSwRequest({ method: "GET", origin, requestUrl }),
      ).toBe(true);
    }

    expect(
      isCacheableSwRequest({
        method: "GET",
        origin,
        requestUrl: `${origin}/_next/static/chunks/main-123.js`,
        buildId: "dev",
      }),
    ).toBe(false);
  });

  it("deletes old SW caches on activate without calling skipWaiting or touching IndexedDB", async () => {
    const script = generateServiceWorkerScript("build-v2");
    const listeners = new Map<string, (event: unknown) => void>();
    const cacheEntries = new Map<string, Map<string, unknown>>([
      ["wafrah-assets-build-v1", new Map([["/icon-192.png", { ok: true }]])],
      ["unrelated-cache", new Map([["/keep", { ok: true }]])],
    ]);
    const indexedDbQueue = new Map([
      ["offline-item-1", { clientId: "offline-item-1", quantity: "1.5" }],
    ]);
    const skipWaiting = vi.fn();

    const mockCaches = {
      open: vi.fn(async (name: string) => {
        if (!cacheEntries.has(name)) cacheEntries.set(name, new Map());
        const map = cacheEntries.get(name)!;
        return {
          addAll: vi.fn(async (urls: string[]) => {
            for (const u of urls) map.set(u, { ok: true });
          }),
          put: vi.fn(async (req: { url: string }, res: unknown) => {
            map.set(req.url, res);
          }),
        };
      }),
      keys: vi.fn(async () => Array.from(cacheEntries.keys())),
      delete: vi.fn(async (name: string) => cacheEntries.delete(name)),
      match: vi.fn(async () => undefined),
    };

    const mockSelf = {
      location: { origin: "https://wafrah.sa" },
      skipWaiting,
      addEventListener: (
        type: string,
        handler: (event: unknown) => void,
      ) => {
        listeners.set(type, handler);
      },
    };

    const runner = new Function("self", "caches", "fetch", script);
    runner(mockSelf, mockCaches, vi.fn());

    const installPromises: Array<Promise<unknown>> = [];
    listeners.get("install")?.({
      waitUntil: (p: Promise<unknown>) => installPromises.push(p),
    });
    await Promise.all(installPromises);

    expect(skipWaiting).not.toHaveBeenCalled();
    const newCache = cacheEntries.get(buildSwCacheName("build-v2"));
    expect(newCache).toBeDefined();
    for (const url of STATIC_PRECACHE_URLS) {
      expect(newCache?.has(url)).toBe(true);
    }

    const activatePromises: Array<Promise<unknown>> = [];
    listeners.get("activate")?.({
      waitUntil: (p: Promise<unknown>) => activatePromises.push(p),
    });
    await Promise.all(activatePromises);

    expect(cacheEntries.has("wafrah-assets-build-v1")).toBe(false);
    expect(cacheEntries.has(buildSwCacheName("build-v2"))).toBe(true);
    expect(cacheEntries.has("unrelated-cache")).toBe(true);
    expect(indexedDbQueue.has("offline-item-1")).toBe(true);

    // Fetch handler ignores /api/ and authenticated pages while handling static assets
    const apiRespondWith = vi.fn();
    listeners.get("fetch")?.({
      request: {
        method: "GET",
        mode: "cors",
        url: "https://wafrah.sa/api/waste-entries",
        headers: new Headers(),
      },
      respondWith: apiRespondWith,
    });
    expect(apiRespondWith).not.toHaveBeenCalled();

    const dashboardRespondWith = vi.fn();
    listeners.get("fetch")?.({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://wafrah.sa/dashboard",
        headers: new Headers({ accept: "text/html" }),
      },
      respondWith: dashboardRespondWith,
    });
    expect(dashboardRespondWith).not.toHaveBeenCalled();

    const staticRespondWith = vi.fn();
    listeners.get("fetch")?.({
      request: {
        method: "GET",
        mode: "no-cors",
        url: "https://wafrah.sa/_next/static/chunks/app.js",
        headers: new Headers(),
      },
      respondWith: staticRespondWith,
    });
    expect(staticRespondWith).toHaveBeenCalledTimes(1);
  });

  it("never caches /_next/static/* chunks and clears dev SW caches in dev mode", async () => {
    const script = generateServiceWorkerScript("dev");
    const listeners = new Map<string, (event: unknown) => void>();
    const cacheEntries = new Map<string, Map<string, unknown>>([
      ["wafrah-assets-dev", new Map([["/_next/static/chunks/old.js", { ok: true }]])],
    ]);

    const mockCaches = {
      open: vi.fn(async (name: string) => {
        if (!cacheEntries.has(name)) cacheEntries.set(name, new Map());
        const map = cacheEntries.get(name)!;
        return {
          addAll: vi.fn(async (urls: string[]) => {
            for (const u of urls) map.set(u, { ok: true });
          }),
          put: vi.fn(async (req: { url: string }, res: unknown) => {
            map.set(req.url, res);
          }),
        };
      }),
      keys: vi.fn(async () => Array.from(cacheEntries.keys())),
      delete: vi.fn(async (name: string) => cacheEntries.delete(name)),
      match: vi.fn(async () => undefined),
    };

    const mockSelf = {
      location: { origin: "http://localhost:3000" },
      addEventListener: (
        type: string,
        handler: (event: unknown) => void,
      ) => {
        listeners.set(type, handler);
      },
    };

    const runner = new Function("self", "caches", "fetch", script);
    runner(mockSelf, mockCaches, vi.fn());

    const activatePromises: Array<Promise<unknown>> = [];
    listeners.get("activate")?.({
      waitUntil: (p: Promise<unknown>) => activatePromises.push(p),
    });
    await Promise.all(activatePromises);
    expect(cacheEntries.has("wafrah-assets-dev")).toBe(false);

    const devStaticRespondWith = vi.fn();
    listeners.get("fetch")?.({
      request: {
        method: "GET",
        mode: "no-cors",
        url: "http://localhost:3000/_next/static/chunks/pilot-lead-form.js",
        headers: new Headers(),
      },
      respondWith: devStaticRespondWith,
    });
    expect(devStaticRespondWith).not.toHaveBeenCalled();
  });

  it("produces installable manifest with standalone display, scope, theme, and any/maskable icons", () => {
    const arManifest = buildWebManifest("ar");
    const enManifest = buildWebManifest("en");

    expect(arManifest.id).toBe("/");
    expect(arManifest.start_url).toBe("/log");
    expect(arManifest.scope).toBe("/");
    expect(arManifest.display).toBe("standalone");
    expect(arManifest.theme_color).toBe("#0B4F45");
    expect(arManifest.background_color).toBe("#F2F8F6");
    expect(arManifest.dir).toBe("rtl");
    expect(enManifest.dir).toBe("ltr");

    const icons = arManifest.icons ?? [];
    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        }),
      ]),
    );
  });
});
