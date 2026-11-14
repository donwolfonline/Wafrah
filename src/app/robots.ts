import type { MetadataRoute } from "next";
import { env } from "@/env";
import { getSiteBaseUrl } from "@/features/landing/landing-config";
import { isVercelProductionEnv } from "@/lib/domain-routing";
import { DISALLOWED_APP_PATH_PREFIXES } from "@/lib/seo";

export const dynamic = "force-dynamic";

export function buildRobotsConfig(options?: {
  isVercelProduction?: boolean;
  baseUrl?: string;
}): MetadataRoute.Robots {
  const isVercelProduction =
    options?.isVercelProduction ?? isVercelProductionEnv(env);

  if (!isVercelProduction) {
    return {
      rules: [
        {
          userAgent: "*",
          disallow: "/",
        },
      ],
    };
  }

  const baseUrl = (
    options?.baseUrl ?? getSiteBaseUrl().toString()
  ).replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/en", "/help", "/og-ar.png", "/og-en.png"],
        disallow: [
          ...DISALLOWED_APP_PATH_PREFIXES.flatMap((prefix) =>
            prefix === "/login" || prefix === "/design-check"
              ? [prefix]
              : [prefix, `${prefix}/`],
          ),
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

export default function robots(): MetadataRoute.Robots {
  return buildRobotsConfig();
}
