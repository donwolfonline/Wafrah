import { createTranslator } from "next-intl";
import { getServerAppUrl } from "@/lib/app-url";
import type { SupportedLocale } from "@/lib/format";
import arMessages from "../../../messages/ar.json";
import enMessages from "../../../messages/en.json";

const MESSAGES_BY_LOCALE = {
  ar: arMessages,
  en: enMessages,
} as const;

export function getMessagesForLocale(locale: SupportedLocale) {
  return locale === "en" ? MESSAGES_BY_LOCALE.en : MESSAGES_BY_LOCALE.ar;
}

export function getEmailTranslator(locale: SupportedLocale) {
  return createTranslator({
    locale,
    messages: getMessagesForLocale(locale),
    namespace: "notifications.emails",
  });
}

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface BrandedEmailShellParams {
  locale: SupportedLocale;
  subject: string;
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  preferencesUrl: string;
}

/**
 * Wraps email body HTML in a branded Wafrah (teal #0F4C45 + gold #C89B3C) table layout
 * with explicit RTL/LTR direction and inline CSS for email client compatibility.
 */
export function wrapBrandedEmailHtml(params: BrandedEmailShellParams): string {
  const isRtl = params.locale === "ar";
  const dir = isRtl ? "rtl" : "ltr";
  const align = isRtl ? "right" : "left";
  const t = getEmailTranslator(params.locale);

  return [
    `<!DOCTYPE html>`,
    `<html lang="${params.locale}" dir="${dir}">`,
    `<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /><title>${escapeHtml(params.subject)}</title></head>`,
    `<body style="margin:0;padding:0;background-color:#F4F7F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Tahoma,Arial,sans-serif;color:#102421;direction:${dir};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F7F6;padding:24px 12px;">`,
    `<tr><td align="center">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border:1px solid #D9E4E1;border-radius:10px;overflow:hidden;">`,
    `<tr><td style="background-color:#0F4C45;border-bottom:4px solid #C89B3C;padding:18px 24px;text-align:${align};">`,
    `<div style="font-size:18px;font-weight:700;color:#FFFFFF;">${escapeHtml(t("brandHeader"))}</div>`,
    `<div style="font-size:12px;color:#D8ECE8;margin-top:4px;">${escapeHtml(t("brandTagline"))}</div>`,
    `</td></tr>`,
    `<tr><td style="padding:24px;text-align:${align};direction:${dir};">`,
    `<h1 style="margin:0 0 14px 0;font-size:20px;line-height:1.4;color:#0F4C45;">${escapeHtml(params.title)}</h1>`,
    params.bodyHtml,
    `<div style="margin-top:24px;text-align:${align};">`,
    `<a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;background-color:#0F4C45;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;border:1px solid #C89B3C;">${escapeHtml(params.ctaLabel)}</a>`,
    `</div>`,
    `</td></tr>`,
    `<tr><td style="background-color:#F8FBFA;border-top:1px solid #E5ECEA;padding:14px 24px;font-size:12px;line-height:1.6;color:#526965;text-align:${align};">`,
    `<div>${escapeHtml(t("footerNote"))}</div>`,
    `<div style="margin-top:6px;"><a href="${escapeHtml(params.preferencesUrl)}" style="color:#0F4C45;text-decoration:underline;">${escapeHtml(t("managePreferencesLabel"))}</a></div>`,
    `</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
}

export function buildBaseAppUrl(rawAppUrl?: string): string {
  return getServerAppUrl(rawAppUrl);
}

export function pickRestaurantName(
  locale: SupportedLocale,
  name: string,
  nameAr: string,
): string {
  return locale === "ar" ? nameAr : name;
}
