import { describe, expect, it } from "vitest";
import {
  buildCanonicalHostRedirectSpec,
  buildNextConfigCanonicalRedirects,
  isVercelProductionEnv,
} from "./domain-routing";

describe("canonical domain routing & non-production safety", () => {
  it("recognizes VERCEL_ENV === production exclusively as production indexable", () => {
    expect(isVercelProductionEnv({ VERCEL_ENV: "production" })).toBe(true);
    expect(isVercelProductionEnv({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isVercelProductionEnv({ VERCEL_ENV: "development" })).toBe(false);
    expect(isVercelProductionEnv({})).toBe(false);
  });

  it("builds www -> apex redirect when canonical NEXT_PUBLIC_SITE_URL is apex", () => {
    expect(buildCanonicalHostRedirectSpec("https://wafrah.sa")).toEqual({
      sourceHost: "www.wafrah.sa",
      canonicalHost: "wafrah.sa",
      destinationOrigin: "https://wafrah.sa",
    });

    expect(buildCanonicalHostRedirectSpec("https://wafrah.com.sa/")).toEqual({
      sourceHost: "www.wafrah.com.sa",
      canonicalHost: "wafrah.com.sa",
      destinationOrigin: "https://wafrah.com.sa",
    });
  });

  it("builds apex -> www redirect when canonical NEXT_PUBLIC_SITE_URL uses www", () => {
    expect(buildCanonicalHostRedirectSpec("https://www.wafrah.sa")).toEqual({
      sourceHost: "wafrah.sa",
      canonicalHost: "www.wafrah.sa",
      destinationOrigin: "https://www.wafrah.sa",
    });
  });

  it("skips localhost, vercel preview subdomains, non-https, and custom subdomains", () => {
    expect(buildCanonicalHostRedirectSpec("http://localhost:3000")).toBeNull();
    expect(buildCanonicalHostRedirectSpec("http://wafrah.sa")).toBeNull();
    expect(
      buildCanonicalHostRedirectSpec("https://wafrah-pr-12.vercel.app"),
    ).toBeNull();
    expect(buildCanonicalHostRedirectSpec("https://app.wafrah.sa")).toBeNull();
  });

  it("emits Next.js permanent redirect rule only in non-preview envs with HTTPS NEXT_PUBLIC_SITE_URL", () => {
    expect(
      buildNextConfigCanonicalRedirects({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SITE_URL: "https://wafrah.sa",
      }),
    ).toEqual([
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.wafrah.sa" }],
        destination: "https://wafrah.sa/:path*",
        permanent: true,
      },
    ]);

    expect(
      buildNextConfigCanonicalRedirects({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SITE_URL: "https://wafrah.sa",
      }),
    ).toEqual([]);

    expect(
      buildNextConfigCanonicalRedirects({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SITE_URL: "https://www.wafrah.sa",
      }),
    ).toEqual([
      {
        source: "/:path*",
        has: [{ type: "host", value: "wafrah.sa" }],
        destination: "https://www.wafrah.sa/:path*",
        permanent: true,
      },
    ]);
  });
});
