import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isProduction = process.env.NODE_ENV === "production";
const appUrl = (process.env.APP_URL ?? "").trim().toLowerCase();
const isHttpsAppUrl = appUrl.startsWith("https://");
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
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
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
        if (rule?.test?.toString().includes("css") && Array.isArray(rule.use)) {
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
  async headers() {
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
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/en",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
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

export default withNextIntl(nextConfig);
