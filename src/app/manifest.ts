import type { MetadataRoute } from "next";
import { getAppLocale } from "@/i18n/request";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getAppLocale();
  const isAr = locale === "ar";

  return {
    name: isAr
      ? "وفرة — Wafrah لإدارة الهدر الغذائي"
      : "Wafrah — وفرة Food Waste Management",
    short_name: "وفرة / Wafrah",
    description: isAr
      ? "منصة ذكية لتسجيل الهدر الغذائي في المطبخ في أقل من 10 ثوانٍ للمطاعم والفنادق في المملكة العربية السعودية"
      : "Fast offline-first kitchen food waste logging and analytics for restaurants and hotels in Saudi Arabia",
    start_url: "/log",
    scope: "/",
    display: "standalone",
    orientation: "any",
    dir: isAr ? "rtl" : "ltr",
    lang: locale,
    background_color: "#F2F8F6",
    theme_color: "#0B4F45",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
