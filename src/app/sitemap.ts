import type { MetadataRoute } from "next";
import { getSiteBaseUrl } from "@/features/landing/landing-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteBaseUrl().toString().replace(/\/+$/, "");
  const lastModified = new Date();

  const alternates = {
    languages: {
      "ar-SA": `${baseUrl}/`,
      en: `${baseUrl}/en`,
      "x-default": `${baseUrl}/`,
    },
  };

  return [
    {
      url: `${baseUrl}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
      alternates,
    },
    {
      url: `${baseUrl}/en`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
      alternates,
    },
    {
      url: `${baseUrl}/help`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
