import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { parseNextConfigEnv } from "./src/env.core";
import {
  buildNextConfigCanonicalRedirects,
  isVercelProductionEnv,
} from "./src/lib/domain-routing";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default function buildNextConfig(phase: string): NextConfig {
  const env = parseNextConfigEnv(phase);
  const isProduction = env.NODE_ENV === "production";
  const isVercel = env.VERCEL === "1";
  const wafrahBuildId =
    (
      env.WAFRAH_BUILD_ID?.trim() ||
      env.VERCEL_DEPLOYMENT_ID?.trim() ||
      env.VERCEL_GIT_COMMIT_SHA?.trim() ||
      (isProduction ? `build-${Date.now().toString(36)}` : "dev")
    )
      .replace(/[^A-Za-z0-9._-]/g, "")
      .slice(0, 48) || "dev";
  const appUrl = (env.APP_URL ?? "").trim().toLowerCase();
  const isHttpsAppUrl = appUrl.startsWith("https://") || isVercel;
  const isLocalHttpAppUrl =
    appUrl.startsWith("http://localhost") ||
    appUrl.startsWith("http://127.0.0.1");

  // Content-Security-Policy for Next.js App Router with RSC and Recharts.
  // 'unsafe-inline' and 'unsafe-eval' are required by Next.js / Recharts at this time.
  // See SECURITY.md for nonce-based CSP migration guidance.
  const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    ...(isProduction && isHttpsAppUrl ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const nextConfig: NextConfig = {
    ...(env.NEXT_DIST_DIR ? { distDir: env.NEXT_DIST_DIR } : {}),
    env: {
      WAFRAH_BUILD_ID: wafrahBuildId,
    },
    generateBuildId: async () => wafrahBuildId,
    reactStrictMode: true,
    transpilePackages: ["next-intl"],
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
    webpack: (config) => {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "next-intl/config": path.resolve(process.cwd(), "src/i18n/request.ts"),
      };

      const oneOfRule = config.module?.rules?.find(
        (rule: { oneOf?: unknown[] }) => Array.isArray(rule?.oneOf),
      );
      if (oneOfRule?.oneOf) {
        for (const rule of oneOfRule.oneOf) {
          if (
            rule?.test?.toString().includes("css") &&
            Array.isArray(rule.use)
          ) {
            rule.use.push({
              loader: path.resolve(
                process.cwd(),
                "node_modules/@tailwindcss/turbopack/dist/index.js",
              ),
            });
          }
        }
      }
      return config;
    },
    async redirects() {
      return buildNextConfigCanonicalRedirects(env);
    },
    async headers() {
      const isVercelProduction = isVercelProductionEnv(env);

      return [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "DENY" },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
            {
              key: "Permissions-Policy",
              value: "camera=(), microphone=(), geolocation=()",
            },
            {
              key: "Content-Security-Policy",
              value: CSP,
            },
            ...(!isVercelProduction
              ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
              : []),
            ...(isProduction && !isLocalHttpAppUrl
              ? [
                  {
                    key: "Strict-Transport-Security",
                    value: "max-age=63072000; includeSubDomains; preload",
                  },
                ]
              : []),
          ],
        },
        {
          source: "/",
          headers: [
            {
              key: "Cache-Control",
              value: "private, max-age=0, must-revalidate",
            },
          ],
        },
        {
          source: "/en",
          headers: [
            {
              key: "Cache-Control",
              value: "private, max-age=0, must-revalidate",
            },
          ],
        },
        {
          source: "/sw.js",
          headers: [
            {
              key: "Cache-Control",
              value: "no-cache",
            },
            {
              key: "Service-Worker-Allowed",
              value: "/",
            },
          ],
        },
        {
          source:
            "/:section(dashboard|log|admin|login|menu|imports|reports|settings|design-check|api)/:path*",
          headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
        },
        {
          source:
            "/:section(dashboard|log|admin|login|menu|imports|reports|settings|design-check)",
          headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
        },
      ];
    },
  };

  return withNextIntl(nextConfig);
}
