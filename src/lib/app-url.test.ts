import { describe, expect, it } from "vitest";
import {
  getPublicSiteBaseUrl,
  getServerAppUrl,
  isProductionRuntime,
  resolveAppOrigin,
} from "./app-url";

describe("app-url resolution", () => {
  it("falls back to http://localhost:3000 when no env vars are set", () => {
    expect(getPublicSiteBaseUrl({}).origin).toBe("http://localhost:3000");
    expect(getServerAppUrl(undefined, {})).toBe("http://localhost:3000");
  });

  it("uses explicit NEXT_PUBLIC_SITE_URL over Vercel defaults for public site URL", () => {
    const url = getPublicSiteBaseUrl({
      NEXT_PUBLIC_SITE_URL: "https://wafrah.sa/",
      APP_URL: "https://app.wafrah.sa",
      VERCEL_PROJECT_PRODUCTION_URL: "wafrah-prod.vercel.app",
      VERCEL_URL: "wafrah-abc.vercel.app",
    });

    expect(url.origin).toBe("https://wafrah.sa");
  });

  it("uses VERCEL_PROJECT_PRODUCTION_URL in production when explicit URLs are omitted", () => {
    const env = {
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "wafrah.vercel.app",
      VERCEL_URL: "wafrah-git-main-123.vercel.app",
    };

    expect(getPublicSiteBaseUrl(env).origin).toBe("https://wafrah.vercel.app");
    expect(getServerAppUrl(undefined, env)).toBe("https://wafrah.vercel.app");
  });

  it("prefers VERCEL_URL over VERCEL_PROJECT_PRODUCTION_URL on preview deployments", () => {
    const env = {
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_PRODUCTION_URL: "wafrah.sa",
      VERCEL_URL: "wafrah-pr-42.vercel.app",
    };

    expect(getPublicSiteBaseUrl(env).origin).toBe("https://wafrah-pr-42.vercel.app");
    expect(getServerAppUrl(undefined, env)).toBe("https://wafrah-pr-42.vercel.app");
  });

  it("prefers VERCEL_URL over NEXT_PUBLIC_SITE_URL for server email links on preview", () => {
    const env = {
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SITE_URL: "https://wafrah.sa",
      VERCEL_URL: "wafrah-preview.vercel.app",
    };

    expect(getServerAppUrl(undefined, env)).toBe("https://wafrah-preview.vercel.app");
    expect(getPublicSiteBaseUrl(env).origin).toBe("https://wafrah.sa");
  });

  it("prefers explicit overrideUrl or APP_URL for server app links", () => {
    const env = {
      APP_URL: "https://portal.wafrah.sa/",
      VERCEL_ENV: "preview",
      VERCEL_URL: "wafrah-preview.vercel.app",
    };

    expect(getServerAppUrl(undefined, env)).toBe("https://portal.wafrah.sa");
    expect(getServerAppUrl("https://custom.example.com/path", env)).toBe(
      "https://custom.example.com"
    );
  });

  it("skips malformed candidates cleanly and adds http for bare localhost", () => {
    expect(
      resolveAppOrigin({
        env: {
          NEXT_PUBLIC_SITE_URL: "not a valid url:///",
          APP_URL: "localhost:3005",
        },
        preferPublicSiteUrl: true,
      }).origin
    ).toBe("http://localhost:3005");
  });

  it("detects production runtime from either VERCEL_ENV or NODE_ENV", () => {
    expect(isProductionRuntime({ VERCEL_ENV: "production", NODE_ENV: "test" })).toBe(
      true,
    );
    expect(isProductionRuntime({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(
      true,
    );
    expect(isProductionRuntime({ VERCEL_ENV: "preview", NODE_ENV: "test" })).toBe(
      false,
    );
  });
});
