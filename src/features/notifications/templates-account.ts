import { createTranslator } from "next-intl";
import {
  formatCurrency,
  formatGregorianDate,
  formatNumber,
} from "@/lib/format";
import {
  buildBaseAppUrl,
  escapeHtml,
  getEmailTranslator,
  getMessagesForLocale,
  pickRestaurantName,
  wrapBrandedEmailHtml,
} from "./template-layout";
import type {
  MonthlyReportEmailInput,
  RenderedEmail,
  WelcomeEmailInput,
} from "./types";

export function renderMonthlyReportEmail(
  input: MonthlyReportEmailInput,
): RenderedEmail {
  const locale = input.locale;
  const t = getEmailTranslator(locale);
  const restaurant = pickRestaurantName(
    locale,
    input.restaurantName,
    input.restaurantNameAr,
  );
  const monthLabel = formatGregorianDate(
    `${input.yearMonth}-15T12:00:00.000Z`,
    locale,
    { year: "numeric", month: "long", day: undefined },
  );
  const base = buildBaseAppUrl(input.appUrl);
  const reportUrl = `${base}/reports/${input.yearMonth}`;
  const prefsUrl = `${base}/settings/notifications`;

  const amountFormatted = formatCurrency(input.headlineAmountSar, locale);
  const wasteFormatted = formatCurrency(input.totalWasteSar, locale);
  const headline =
    input.outcome === "SAVED"
      ? t("monthlyReport.savedHeadline", { amount: amountFormatted })
      : input.outcome === "INCREASED"
        ? t("monthlyReport.increasedHeadline", { amount: amountFormatted })
        : input.outcome === "CALIBRATING"
          ? t("monthlyReport.calibratingHeadline", {
              days: formatNumber(input.calibratingDaysLeft, locale),
            })
          : t("monthlyReport.flatHeadline");

  const accentColor =
    input.outcome === "INCREASED" ? "#B91C1C" : "#0F4C45";
  const boxBg = input.outcome === "INCREASED" ? "#FDF2F2" : "#F4F7F6";

  const subject = t("monthlyReport.subject", { restaurant, month: monthLabel });
  const title = t("monthlyReport.title");
  const intro = t("monthlyReport.intro", { restaurant, month: monthLabel });
  const estimateTag = t("monthlyReport.estimateTag");
  const wasteLine = t("monthlyReport.wasteTotalLabel", {
    wasteSar: wasteFormatted,
  });
  const ctaLabel = t("monthlyReport.ctaLabel");

  const bodyHtml =
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">${escapeHtml(intro)}</p>` +
    `<div style="padding:14px 16px;background-color:${boxBg};border:1px solid #D9E4E1;border-inline-start:4px solid ${accentColor};border-radius:8px;margin-bottom:12px;">` +
    `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background-color:#FFFFFF;border:1px solid #C89B3C;color:#0F4C45;font-size:11px;font-weight:700;margin-bottom:8px;">${escapeHtml(estimateTag)}</span>` +
    `<div style="font-size:17px;font-weight:700;color:${accentColor};">${escapeHtml(headline)}</div>` +
    `<div style="font-size:13px;color:#526965;margin-top:6px;">${escapeHtml(wasteLine)}</div>` +
    `</div>`;

  const text = [
    title,
    "",
    intro,
    `[${estimateTag}] ${headline}`,
    wasteLine,
    "",
    `${ctaLabel}: ${reportUrl}`,
    `${t("managePreferencesLabel")}: ${prefsUrl}`,
  ].join("\n");

  return {
    subject,
    html: wrapBrandedEmailHtml({
      locale,
      subject,
      title,
      bodyHtml,
      ctaLabel,
      ctaUrl: reportUrl,
      preferencesUrl: prefsUrl,
    }),
    text,
  };
}

export function renderWelcomeEmail(input: WelcomeEmailInput): RenderedEmail {
  const locale = input.locale;
  const messages = getMessagesForLocale(locale);
  const t = getEmailTranslator(locale);
  const tRoles = createTranslator({ locale, messages, namespace: "roles" });

  const restaurant = pickRestaurantName(
    locale,
    input.restaurantName,
    input.restaurantNameAr,
  );
  const roleLabel = tRoles(input.role);
  const base = buildBaseAppUrl(input.appUrl);
  const loginUrl = `${base}/login`;
  const prefsUrl = `${base}/settings/notifications`;

  const subject = t("welcome.subject", { restaurant });
  const title = t("welcome.title");
  const greeting = t("welcome.greeting", { name: input.recipientName });
  const intro = t("welcome.intro");
  const branchLine = `${t("welcome.branchLabel")}: ${restaurant} (${input.branchCode})`;
  const roleLine = `${t("welcome.roleLabel")}: ${roleLabel}`;
  const ctaLabel = t("welcome.ctaLabel");

  const bodyHtml =
    `<p style="margin:0 0 8px 0;font-size:15px;font-weight:600;">${escapeHtml(greeting)}</p>` +
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">${escapeHtml(intro)}</p>` +
    `<div style="padding:12px 14px;background-color:#F4F7F6;border:1px solid #D9E4E1;border-inline-start:4px solid #C89B3C;border-radius:8px;font-size:14px;line-height:1.7;">` +
    `<div>${escapeHtml(branchLine)}</div>` +
    `<div>${escapeHtml(roleLine)}</div>` +
    `</div>`;

  const text = [
    title,
    "",
    greeting,
    intro,
    branchLine,
    roleLine,
    "",
    `${ctaLabel}: ${loginUrl}`,
    `${t("managePreferencesLabel")}: ${prefsUrl}`,
  ].join("\n");

  return {
    subject,
    html: wrapBrandedEmailHtml({
      locale,
      subject,
      title,
      bodyHtml,
      ctaLabel,
      ctaUrl: loginUrl,
      preferencesUrl: prefsUrl,
    }),
    text,
  };
}
