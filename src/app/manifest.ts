import type { MetadataRoute } from "next";
import { getAppLocale } from "@/i18n/request";
import { buildWebManifest } from "@/lib/pwa";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getAppLocale();
  return buildWebManifest(locale);
}
