import { createTranslator } from "next-intl";
import {
  getFounderEmail,
  getWhatsAppHref,
} from "@/features/landing/landing-config";
import {
  buildBaseAppUrl,
  escapeHtml,
  getEmailTranslator,
  getMessagesForLocale,
} from "@/features/notifications/template-layout";
import { sendEmail, type EmailSendResult } from "@/lib/email";
import { formatGregorianDate, formatNumber } from "@/lib/format";
import type { LeadCityValue, LeadPosValue, LeadStatusValue } from "./schema";

export interface LeadNotificationRecord {
  id: string;
  name: string;
  businessName: string;
  city: LeadCityValue;
  cityOther: string | null;
  role: string;
  phone: string;
  email: string | null;
  branches: number;
  posSystem: LeadPosValue;
  locale: "ar" | "en";
  consent: boolean;
  consentAt: Date;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  status: LeadStatusValue;
  createdAt: Date;
}

export interface LeadNotificationDeps {
  sendEmailFn?: typeof sendEmail;
  founderEmail?: string | null;
  appUrl?: string;
  whatsappNumber?: string;
}

function wrapLeadEmailHtml(params: {
  locale: "ar" | "en";
  brandHeader: string;
  brandTagline: string;
  title: string;
  bodyHtml: string;
  footerNote: string;
}): string {
  const dir = params.locale === "ar" ? "rtl" : "ltr";
  const font = "'Segoe UI', Tahoma, Arial, sans-serif";
  return `<!DOCTYPE html><html lang="${params.locale}" dir="${dir}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body style="margin:0;padding:0;background:#F2F8F6;font-family:${font};color:#0E2320;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F8F6;padding:24px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d5e6e1;"><tr><td style="background:#0B4F45;padding:20px 24px;border-bottom:4px solid #C9A227;"><div style="font-size:20px;font-weight:700;color:#fff;">${escapeHtml(params.brandHeader)}</div><div style="font-size:12px;color:#d6ebe6;margin-top:4px;">${escapeHtml(params.brandTagline)}</div></td></tr><tr><td style="padding:24px;"><h1 style="margin:0 0 14px;font-size:20px;color:#0B4F45;">${escapeHtml(params.title)}</h1>${params.bodyHtml}</td></tr><tr><td style="padding:16px 24px;background:#F7FBFA;border-top:1px solid #e1efeb;font-size:12px;color:#526B67;">${escapeHtml(params.footerNote)}</td></tr></table></td></tr></table></body></html>`;
}

function cityDisplayText(lead: LeadNotificationRecord, cityLabel: string): string {
  return lead.city === "OTHER" && lead.cityOther ? `${cityLabel} (${lead.cityOther})` : cityLabel;
}

function renderKeyValueRows(rows: ReadonlyArray<[string, string, string?]>): string {
  return rows
    .map(([label, value, href]) => {
      const cell = href
        ? `<a href="${escapeHtml(href)}" style="color:#0B4F45;font-weight:600;">${escapeHtml(value)}</a>`
        : escapeHtml(value);
      return `<tr><td style="padding:7px 10px;border-bottom:1px solid #e6f0ed;font-weight:600;color:#274540;width:36%;">${escapeHtml(label)}</td><td style="padding:7px 10px;border-bottom:1px solid #e6f0ed;color:#0E2320;">${cell}</td></tr>`;
    })
    .join("");
}

export function buildFounderLeadEmail(
  lead: LeadNotificationRecord,
  baseUrl: string,
): { subject: string; html: string; text: string } {
  const locale = "en" as const;
  const messages = getMessagesForLocale(locale);
  const tBrand = getEmailTranslator(locale);
  const tFounder = createTranslator({ locale, messages, namespace: "notifications.emails.leadFounder" });
  const tLeads = createTranslator({ locale, messages, namespace: "admin.leads" });

  const cityDisplay = cityDisplayText(lead, tLeads(`cities.${lead.city}`));
  const posDisplay = tLeads(`posSystems.${lead.posSystem}`);
  const utmDisplay =
    [
      lead.utmSource && `source=${lead.utmSource}`,
      lead.utmMedium && `medium=${lead.utmMedium}`,
      lead.utmCampaign && `campaign=${lead.utmCampaign}`,
    ]
      .filter(Boolean)
      .join(" | ") || "-";
  const submittedAt = `${formatGregorianDate(lead.createdAt, locale, { hour: "2-digit", minute: "2-digit", hour12: true })} (${lead.createdAt.toISOString()})`;
  const adminUrl = `${baseUrl}/admin`;
  const phoneDigits = lead.phone.replace(/\D/g, "");
  const whatsappLink = phoneDigits ? `https://wa.me/${phoneDigits}` : undefined;

  const rows: Array<[string, string, string?]> = [
    [tFounder("fields.leadId"), lead.id],
    [tFounder("fields.name"), lead.name],
    [tFounder("fields.role"), lead.role],
    [tFounder("fields.businessName"), lead.businessName],
    [tFounder("fields.city"), cityDisplay],
    [tFounder("fields.phone"), lead.phone, whatsappLink],
    [tFounder("fields.email"), lead.email ?? "-"],
    [tFounder("fields.branches"), String(lead.branches)],
    [tFounder("fields.posSystem"), posDisplay],
    [tFounder("fields.locale"), lead.locale.toUpperCase()],
    [tFounder("fields.consent"), `${lead.consent ? "Yes" : "No"} (${lead.consentAt.toISOString()})`],
    [tFounder("fields.utm"), utmDisplay],
    [tFounder("fields.submittedAt"), submittedAt],
  ];

  const subject = tFounder("subject", {
    businessName: lead.businessName,
    city: cityDisplay,
    branches: String(lead.branches),
  });
  const bodyHtml = `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#274540;">${escapeHtml(tFounder("intro"))}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6f0ed;border-radius:8px;overflow:hidden;font-size:13px;">${renderKeyValueRows(rows)}</table><div style="margin-top:18px;"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#0B4F45;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(tFounder("openAdminCta"))}</a></div>`;

  return {
    subject,
    html: wrapLeadEmailHtml({
      locale,
      brandHeader: tBrand("brandHeader"),
      brandTagline: tBrand("brandTagline"),
      title: tFounder("title"),
      bodyHtml,
      footerNote: adminUrl,
    }),
    text: [subject, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `${tFounder("openAdminCta")}: ${adminUrl}`].join("\n"),
  };
}

export function buildLeadConfirmationEmail(
  lead: LeadNotificationRecord,
  whatsappNumber?: string,
): { subject: string; html: string; text: string } {
  const locale = lead.locale;
  const messages = getMessagesForLocale(locale);
  const tBrand = getEmailTranslator(locale);
  const tConfirm = createTranslator({ locale, messages, namespace: "notifications.emails.leadConfirmation" });
  const tLeads = createTranslator({ locale, messages, namespace: "admin.leads" });

  const cityDisplay = cityDisplayText(lead, tLeads(`cities.${lead.city}`));
  const posDisplay = tLeads(`posSystems.${lead.posSystem}`);
  const summaryRows: Array<[string, string]> = [
    [tConfirm("cityLabel"), cityDisplay],
    [tConfirm("branchesLabel"), formatNumber(lead.branches, locale)],
    [tConfirm("posLabel"), posDisplay],
  ];
  const whatsappUrl = getWhatsAppHref(whatsappNumber);
  const whatsappHtml = whatsappUrl
    ? `<div style="margin-top:18px;"><a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;background:#0B4F45;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(tConfirm("whatsappCta"))}</a></div>`
    : "";

  const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;font-weight:600;">${escapeHtml(tConfirm("greeting", { name: lead.name }))}</p><p style="margin:0 0 12px;font-size:14px;line-height:1.7;">${escapeHtml(tConfirm("intro", { businessName: lead.businessName }))}</p><p style="margin:0 0 16px;font-size:14px;line-height:1.7;">${escapeHtml(tConfirm("followUp"))}</p><div style="background:#F7FBFA;border:1px solid #d5e6e1;border-radius:8px;padding:12px 14px;"><div style="font-size:13px;font-weight:700;color:#0B4F45;margin-bottom:6px;">${escapeHtml(tConfirm("summaryTitle"))}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">${renderKeyValueRows(summaryRows)}</table></div>${whatsappHtml}`;

  const subject = tConfirm("subject", { businessName: lead.businessName });
  return {
    subject,
    html: wrapLeadEmailHtml({
      locale,
      brandHeader: tBrand("brandHeader"),
      brandTagline: tBrand("brandTagline"),
      title: tConfirm("title"),
      bodyHtml,
      footerNote: tConfirm("footerNote"),
    }),
    text: [
      tConfirm("greeting", { name: lead.name }),
      "",
      tConfirm("intro", { businessName: lead.businessName }),
      tConfirm("followUp"),
      "",
      `${tConfirm("summaryTitle")}:`,
      ...summaryRows.map(([k, v]) => `- ${k}: ${v}`),
      ...(whatsappUrl ? ["", `${tConfirm("whatsappCta")}: ${whatsappUrl}`] : []),
    ].join("\n"),
  };
}

export async function sendLeadNotifications(
  lead: LeadNotificationRecord,
  deps?: LeadNotificationDeps,
): Promise<{ founderSent: boolean; confirmationSent: boolean }> {
  const sendEmailFn = deps?.sendEmailFn ?? sendEmail;
  const founderEmail =
    deps?.founderEmail !== undefined ? deps.founderEmail : getFounderEmail();
  const baseUrl = deps?.appUrl ?? buildBaseAppUrl();

  const tasks: Array<Promise<{ kind: "founder" | "confirm"; res: EmailSendResult }>> = [];
  if (founderEmail) {
    const rendered = buildFounderLeadEmail(lead, baseUrl);
    tasks.push(
      sendEmailFn(founderEmail, rendered.subject, rendered.html, rendered.text).then(
        (res) => ({ kind: "founder" as const, res }),
      ),
    );
  } else {
    console.warn("[leads] FOUNDER_EMAIL is not configured; skipping founder notification.");
  }

  if (lead.email) {
    const rendered = buildLeadConfirmationEmail(lead, deps?.whatsappNumber);
    tasks.push(
      sendEmailFn(lead.email, rendered.subject, rendered.html, rendered.text).then((res) => ({
        kind: "confirm" as const,
        res,
      })),
    );
  }

  let founderSent = false;
  let confirmationSent = false;

  try {
    const settled = await Promise.allSettled(tasks);
    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        console.error("[leads] Notification delivery threw:", outcome.reason);
      } else if (!outcome.value.res.ok) {
        console.error(`[leads] ${outcome.value.kind} email failed:`, outcome.value.res.error ?? "unknown error");
      } else if (outcome.value.kind === "founder") {
        founderSent = true;
      } else {
        confirmationSent = true;
      }
    }
  } catch (error) {
    console.error("[leads] Unexpected notification failure:", error);
  }

  return { founderSent, confirmationSent };
}
