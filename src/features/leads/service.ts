import type { sendEmail } from "@/lib/email";
import { platformAdminDb } from "@/lib/tenant";
import {
  sendLeadNotifications,
  type LeadNotificationRecord,
} from "./notifications";
import { checkLeadSubmitRateLimit } from "./rate-limit";
import {
  extractLeadFieldErrors,
  getBranchesBand,
  normalizeSaudiMobilePhone,
  pilotLeadSubmissionSchema,
  type LeadCityValue,
  type LeadFieldErrors,
  type LeadPosValue,
} from "./schema";

export const MIN_LEAD_SUBMIT_ELAPSED_MS = 3000;
export const LEAD_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type LeadSubmissionErrorCode =
  | "validationFailed"
  | "submittedTooFast"
  | "tooManyRequests";

export type SubmitPilotLeadResult =
  | {
      ok: true;
      status: 200 | 201;
      deduplicated: boolean;
      honeypotIgnored?: boolean;
      leadId?: string;
      locale?: "ar" | "en";
      city?: LeadCityValue;
      posSystem?: LeadPosValue;
      branchesBand?: "1" | "2-5" | "6+";
    }
  | {
      ok: false;
      status: 400 | 429;
      errorCode: LeadSubmissionErrorCode;
      fieldErrors?: LeadFieldErrors;
      retryAfterSeconds?: number;
    };

export interface SubmitPilotLeadDeps {
  db?: typeof platformAdminDb;
  nowMs?: number;
  sendEmailFn?: typeof sendEmail;
  founderEmail?: string | null;
  appUrl?: string;
  whatsappNumber?: string;
}

function asPlainRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

export async function submitPilotLead(
  rawInput: unknown,
  clientIp: string,
  deps?: SubmitPilotLeadDeps,
): Promise<SubmitPilotLeadResult> {
  const nowMs = deps?.nowMs ?? Date.now();
  const db = deps?.db ?? platformAdminDb;

  // 1. Per-IP sliding-window rate limit (5 per hour)
  const rateLimit = checkLeadSubmitRateLimit(clientIp, nowMs);
  if (!rateLimit.allowed) {
    return {
      ok: false,
      status: 429,
      errorCode: "tooManyRequests",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  const record = asPlainRecord(rawInput);

  // 2. Honeypot trap: silently accept bots without DB write or email delivery
  const honeypotValue =
    typeof record.hpContactNote === "string" ? record.hpContactNote.trim() : "";
  if (honeypotValue.length > 0) {
    return {
      ok: true,
      status: 200,
      deduplicated: false,
      honeypotIgnored: true,
    };
  }

  // 3. Minimum time-to-submit check (reject submissions under 3 seconds)
  const startedAt =
    typeof record.startedAt === "number" && Number.isFinite(record.startedAt)
      ? record.startedAt
      : null;
  if (startedAt === null || nowMs - startedAt < MIN_LEAD_SUBMIT_ELAPSED_MS) {
    return {
      ok: false,
      status: 400,
      errorCode: "submittedTooFast",
    };
  }

  // 4. Shared Zod schema validation (normalizes Saudi phone and validates consent)
  const parsed = pilotLeadSubmissionSchema.safeParse(record);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      errorCode: "validationFailed",
      fieldErrors: extractLeadFieldErrors(parsed.error.issues),
    };
  }

  const valid = parsed.data;
  const normalizedPhone = normalizeSaudiMobilePhone(valid.phone) ?? valid.phone;
  const dedupeSince = new Date(nowMs - LEAD_DEDUPE_WINDOW_MS);

  // 5. De-duplicate by normalized phone within the last 24 hours
  const existing = await db.lead.findFirst({
    where: {
      phone: normalizedPhone,
      createdAt: { gte: dedupeSince },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (existing) {
    return {
      ok: true,
      status: 200,
      deduplicated: true,
      leadId: existing.id,
      locale: valid.locale,
      city: valid.city,
      posSystem: valid.posSystem,
      branchesBand: getBranchesBand(valid.branches),
    };
  }

  // 6. Persist lead record (never stores client IP or tenantId)
  const created = await db.lead.create({
    data: {
      name: valid.name,
      businessName: valid.businessName,
      city: valid.city,
      cityOther: valid.city === "OTHER" ? valid.cityOther : null,
      role: valid.role,
      phone: normalizedPhone,
      email: valid.email,
      branches: valid.branches,
      posSystem: valid.posSystem,
      locale: valid.locale,
      consent: valid.consent,
      consentAt: new Date(nowMs),
      utmSource: valid.utmSource ?? null,
      utmMedium: valid.utmMedium ?? null,
      utmCampaign: valid.utmCampaign ?? null,
      status: "NEW",
    },
  });

  // 7. Send founder & confirmation emails (never fails submission on delivery errors)
  const notificationRecord: LeadNotificationRecord = {
    id: created.id,
    name: created.name,
    businessName: created.businessName,
    city: created.city,
    cityOther: created.cityOther,
    role: created.role,
    phone: created.phone,
    email: created.email,
    branches: created.branches,
    posSystem: created.posSystem,
    locale: created.locale === "en" ? "en" : "ar",
    consent: created.consent,
    consentAt: created.consentAt,
    utmSource: created.utmSource,
    utmMedium: created.utmMedium,
    utmCampaign: created.utmCampaign,
    status: created.status,
    createdAt: created.createdAt,
  };

  await sendLeadNotifications(notificationRecord, {
    sendEmailFn: deps?.sendEmailFn,
    founderEmail: deps?.founderEmail,
    appUrl: deps?.appUrl,
    whatsappNumber: deps?.whatsappNumber,
  });

  return {
    ok: true,
    status: 201,
    deduplicated: false,
    leadId: created.id,
    locale: notificationRecord.locale,
    city: created.city,
    posSystem: created.posSystem,
    branchesBand: getBranchesBand(created.branches),
  };
}
