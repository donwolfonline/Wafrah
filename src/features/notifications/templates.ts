import { createTranslator } from "next-intl";
import { formatAlertMessageText } from "@/lib/alert-format";
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
  CriticalAlertEmailInput,
  RenderedEmail,
  WeeklySummaryEmailInput,
} from "./types";

export function renderCriticalAlertEmail(
  input: CriticalAlertEmailInput,
): RenderedEmail {
  const locale = input.locale;
  const messages = getMessagesForLocale(locale);
  const t = getEmailTranslator(locale);
  const tAlertBody = createTranslator({
    locale,
    messages,
    namespace: "insights.alerts",
  });
  const tUnits = createTranslator({
    locale,
    messages,
    namespace: "waste.units",
  });

  const restaurant = pickRestaurantName(
    locale,
    input.restaurantName,
    input.restaurantNameAr,
  );
  const formattedDate = formatGregorianDate(
    `${input.dateKey}T12:00:00.000Z`,
    locale,
  );
  const base = buildBaseAppUrl(input.appUrl);
  const dashboardUrl = `${base}/dashboard`;
  const prefsUrl = `${base}/settings/notifications`;

  const subject = t("criticalAlert.subject", {
    restaurant,
    date: formattedDate,
  });
  const title = t("criticalAlert.title");
  const intro = t("criticalAlert.intro", {
    restaurant,
    count: formatNumber(input.alerts.length, locale),
  });
  const sevTag = t("criticalAlert.severityTag");
  const ctaLabel = t("criticalAlert.ctaLabel");

  const lines = input.alerts.map((alert) =>
    formatAlertMessageText({
      messageKey: alert.messageKey,
      messageParams: alert.messageParams,
      locale,
      tAlertBody: (key, values) => tAlertBody(key, values),
      tUnits: (unit) => tUnits(unit),
    }),
  );

  const itemsHtml = lines
    .map(
      (msg) =>
        `<li style="margin:0 0 10px 0;padding:10px 12px;background-color:#FDF2F2;border-inline-start:4px solid #B91C1C;border-radius:6px;font-size:14px;line-height:1.5;color:#102421;">` +
        `<strong style="color:#991B1B;">[${escapeHtml(sevTag)}]</strong> ${escapeHtml(msg)}</li>`,
    )
    .join("");

  const bodyHtml =
    `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#102421;">${escapeHtml(intro)}</p>` +
    `<ul style="margin:0;padding:0;list-style:none;">${itemsHtml}</ul>`;

  const text = [
    title,
    "",
    intro,
    "",
    ...lines.map((line) => `- [${sevTag}] ${line}`),
    "",
    `${ctaLabel}: ${dashboardUrl}`,
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
      ctaUrl: dashboardUrl,
      preferencesUrl: prefsUrl,
    }),
    text,
  };
}

export function renderWeeklySummaryEmail(
  input: WeeklySummaryEmailInput,
): RenderedEmail {
  const locale = input.locale;
  const messages = getMessagesForLocale(locale);
  const t = getEmailTranslator(locale);
  const tUnits = createTranslator({
    locale,
    messages,
    namespace: "waste.units",
  });

  const restaurant = pickRestaurantName(
    locale,
    input.restaurantName,
    input.restaurantNameAr,
  );
  const horizon = `${formatGregorianDate(`${input.horizonStart}T12:00:00.000Z`, locale)} – ${formatGregorianDate(`${input.horizonEnd}T12:00:00.000Z`, locale)}`;
  const wasteFormatted = formatCurrency(input.last7dWasteSar, locale);
  const base = buildBaseAppUrl(input.appUrl);
  const dashboardUrl = `${base}/dashboard`;
  const prefsUrl = `${base}/settings/notifications`;

  const subject = t("weeklySummary.subject", { restaurant });
  const title = t("weeklySummary.title");
  const intro = t("weeklySummary.intro", {
    restaurant,
    horizon,
    itemCount: formatNumber(input.totalForecastedItems, locale),
  });
  const wasteLine = t("weeklySummary.wasteSummaryLabel", {
    wasteSar: wasteFormatted,
  });
  const ctaLabel = t("weeklySummary.ctaLabel");
  const align = locale === "ar" ? "right" : "left";

  let tableHtml = `<p style="margin:12px 0 0 0;font-size:14px;color:#526965;">${escapeHtml(t("weeklySummary.noItemsNote"))}</p>`;
  const textRows: string[] = [];

  if (input.topRecommendations.length > 0) {
    const rowsHtml = input.topRecommendations
      .map((row) => {
        const name = locale === "ar" ? row.itemNameAr : row.itemName;
        const unitLabel = ["KG", "LITER", "PORTION", "PIECE"].includes(row.unit)
          ? tUnits(row.unit as "KG" | "LITER" | "PORTION" | "PIECE")
          : row.unit;
        const total = `${formatNumber(row.totalRecommendedQty, locale, { maximumFractionDigits: 1 })} ${unitLabel}`;
        const daily = `${formatNumber(row.dailyAvgQty, locale, { maximumFractionDigits: 1 })} ${unitLabel}`;
        textRows.push(`- ${name}: ${total} (${daily}/d)`);
        return (
          `<tr>` +
          `<td style="padding:8px 10px;border-bottom:1px solid #E5ECEA;font-size:13px;text-align:${align};">${escapeHtml(name)}</td>` +
          `<td style="padding:8px 10px;border-bottom:1px solid #E5ECEA;font-size:13px;font-weight:600;text-align:${align};">${escapeHtml(total)}</td>` +
          `<td style="padding:8px 10px;border-bottom:1px solid #E5ECEA;font-size:13px;color:#526965;text-align:${align};">${escapeHtml(daily)}</td>` +
          `</tr>`
        );
      })
      .join("");

    tableHtml =
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:collapse;border:1px solid #D9E4E1;">` +
      `<thead><tr style="background-color:#F4F7F6;color:#0F4C45;font-size:12px;">` +
      `<th style="padding:8px 10px;text-align:${align};border-bottom:1px solid #D9E4E1;">${escapeHtml(t("weeklySummary.tableHeaders.item"))}</th>` +
      `<th style="padding:8px 10px;text-align:${align};border-bottom:1px solid #D9E4E1;">${escapeHtml(t("weeklySummary.tableHeaders.recommendedTotal"))}</th>` +
      `<th style="padding:8px 10px;text-align:${align};border-bottom:1px solid #D9E4E1;">${escapeHtml(t("weeklySummary.tableHeaders.dailyAvg"))}</th>` +
      `</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  }

  const bodyHtml =
    `<p style="margin:0 0 10px 0;font-size:15px;line-height:1.6;">${escapeHtml(intro)}</p>` +
    `<p style="margin:0 0 12px 0;padding:10px 12px;background-color:#F4F7F6;border-radius:6px;border-inline-start:4px solid #C89B3C;font-size:14px;font-weight:600;color:#0F4C45;">${escapeHtml(wasteLine)}</p>` +
    tableHtml;

  const text = [
    title,
    "",
    intro,
    wasteLine,
    "",
    ...(textRows.length > 0 ? textRows : [t("weeklySummary.noItemsNote")]),
    "",
    `${ctaLabel}: ${dashboardUrl}`,
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
      ctaUrl: dashboardUrl,
      preferencesUrl: prefsUrl,
    }),
    text,
  };
}
