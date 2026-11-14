import type { MetadataRoute } from "next";
import { getSiteBaseUrl } from "@/features/landing/landing-config";
import { DISALLOWED_APP_PATH_PREFIXES } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteBaseUrl().toString().replace(/\/+$/, "");

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
