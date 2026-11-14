import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as leadRouteGet } from "@/app/api/leads/route";
import {
  buildLeadsCsv,
  listAdminLeads,
  updateAdminLead,
} from "@/features/admin/leads-service";
import { clearLeadSubmitRateLimits } from "@/features/leads/rate-limit";
import {
  extractLeadFieldErrors,
  normalizeSaudiMobilePhone,
  pilotLeadFormSchema,
} from "@/features/leads/schema";
import { submitPilotLead } from "@/features/leads/service";
import { AuthorizationError, type SessionUser } from "@/lib/authz";
import { platformAdminDb } from "@/lib/tenant";

const TEST_RUN_TAG = `lead-test-${Date.now()}`;
const createdLeadIds: string[] = [];

const STAFF_USER: SessionUser = {
  userId: "user-staff-test",
  name: "Kitchen Staff",
  role: "STAFF",
  tenantId: "tenant-1",
  locale: "ar",
};

const MANAGER_USER: SessionUser = {
  userId: "user-manager-test",
  name: "Restaurant Manager",
  role: "MANAGER",
  tenantId: "tenant-1",
  locale: "ar",
};

const OWNER_USER: SessionUser = {
  userId: "user-owner-test",
  name: "Restaurant Owner",
  role: "OWNER",
  tenantId: "tenant-1",
  locale: "en",
};

function makeValidPayload(overrides?: Record<string, unknown>) {
  return {
    name: "Faisal Al-Harbi",
    businessName: `Al-Balad Kitchen ${TEST_RUN_TAG}`,
    city: "MAKKAH",
    cityOther: "",
    role: "Owner",
    phone: "0551234567",
    email: "faisal@example.sa",
    branches: 3,
    posSystem: "FOODICS",
    consent: true,
    locale: "ar",
    hpContactNote: "",
    startedAt: 1_760_000_000_000 - 10_000,
    utmSource: "instagram",
    utmMedium: "paid",
    utmCampaign: TEST_RUN_TAG,
    ...overrides,
  };
}

describe("pilot lead capture validation, anti-spam, dedupe, and RBAC", () => {
  beforeEach(() => {
    clearLeadSubmitRateLimits();
  });

  afterAll(async () => {
    if (createdLeadIds.length > 0) {
      await platformAdminDb.auditLog.deleteMany({
        where: { entity: "Lead", entityId: { in: createdLeadIds } },
      });
      await platformAdminDb.lead.deleteMany({
        where: { id: { in: createdLeadIds } },
      });
    }
  });

  it("normalizes accepted Saudi mobile formats to +9665XXXXXXXX and rejects invalid ones", () => {
    expect(normalizeSaudiMobilePhone("0551234567")).toBe("+966551234567");
    expect(normalizeSaudiMobilePhone("551234567")).toBe("+966551234567");
    expect(normalizeSaudiMobilePhone("+966551234567")).toBe("+966551234567");
    expect(normalizeSaudiMobilePhone("00966551234567")).toBe("+966551234567");
    expect(normalizeSaudiMobilePhone("+966 55-123-4567")).toBe("+966551234567");
    expect(normalizeSaudiMobilePhone("٠٥٥١٢٣٤٥٦٧")).toBe("+966551234567");
    expect(normalizeSaudiMobilePhone("٥٥١٢٣٤٥٦٧")).toBe("+966551234567");

    expect(normalizeSaudiMobilePhone("")).toBeNull();
    expect(normalizeSaudiMobilePhone("0451234567")).toBeNull();
    expect(normalizeSaudiMobilePhone("05512345")).toBeNull();
    expect(normalizeSaudiMobilePhone("055123456789")).toBeNull();
    expect(normalizeSaudiMobilePhone("+971501234567")).toBeNull();
  });

  it("requires consent and cityOther when city is OTHER", () => {
    const missingConsent = pilotLeadFormSchema.safeParse(
      makeValidPayload({ consent: false }),
    );
    expect(missingConsent.success).toBe(false);
    if (!missingConsent.success) {
      expect(extractLeadFieldErrors(missingConsent.error.issues)).toEqual({
        consent: "consentRequired",
      });
    }

    const missingOtherCity = pilotLeadFormSchema.safeParse(
      makeValidPayload({ city: "OTHER", cityOther: "   " }),
    );
    expect(missingOtherCity.success).toBe(false);
    if (!missingOtherCity.success) {
      expect(extractLeadFieldErrors(missingOtherCity.error.issues)).toEqual({
        cityOther: "cityOtherRequired",
      });
    }
  });

  it("silently accepts honeypot spam without creating rows or sending email", async () => {
    const sendEmailFn = vi.fn();
    const res = await submitPilotLead(
      makeValidPayload({ hpContactNote: "https://spam.example", phone: "0598887766" }),
      "203.0.113.10",
      { nowMs: 1_760_000_000_000, sendEmailFn, founderEmail: "founder@wafrah.sa" },
    );

    expect(res).toEqual({
      ok: true,
      status: 200,
      deduplicated: false,
      honeypotIgnored: true,
    });
    expect(sendEmailFn).not.toHaveBeenCalled();
  });

  it("rejects submissions completed under 3 seconds", async () => {
    const nowMs = 1_760_000_000_000;
    const fastRes = await submitPilotLead(
      makeValidPayload({ startedAt: nowMs - 1500 }),
      "203.0.113.11",
      { nowMs },
    );
    expect(fastRes).toEqual({
      ok: false,
      status: 400,
      errorCode: "submittedTooFast",
    });
  });

  it("enforces per-IP sliding window limit of 5 requests per hour", async () => {
    const nowMs = 1_760_000_000_000;
    const ip = "203.0.113.12";
    for (let i = 0; i < 5; i += 1) {
      const attempt = await submitPilotLead(
        makeValidPayload({ startedAt: nowMs - 100 }),
        ip,
        { nowMs: nowMs + i * 10 },
      );
      expect(attempt.status).toBe(400);
    }

    const blocked = await submitPilotLead(makeValidPayload(), ip, {
      nowMs: nowMs + 1000,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.status).toBe(429);
    if (!blocked.ok) {
      expect(blocked.errorCode).toBe("tooManyRequests");
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("saves lead, deduplicates within 24h by normalized phone, and ignores email errors", async () => {
    const nowMs = 1_760_000_000_000;
    const uniqueSuffix = String(Math.floor(1000000 + Math.random() * 8999999));
    const localPhone = `059${uniqueSuffix}`;
    const intlPhone = `+966 59-${uniqueSuffix.slice(0, 3)}-${uniqueSuffix.slice(3)}`;

    const failingEmailFn = vi.fn(async () => {
      throw new Error("Simulated SMTP outage");
    });

    const first = await submitPilotLead(
      makeValidPayload({
        phone: localPhone,
        locale: "en",
        startedAt: nowMs - 10_000,
      }),
      "203.0.113.20",
      {
        nowMs,
        sendEmailFn: failingEmailFn,
        founderEmail: "founder@wafrah.sa",
      },
    );

    expect(first.ok).toBe(true);
    expect(first.status).toBe(201);
    if (first.ok && first.leadId) {
      createdLeadIds.push(first.leadId);
      expect(first.deduplicated).toBe(false);
    }
    expect(failingEmailFn).toHaveBeenCalledTimes(2);

    const dup = await submitPilotLead(
      makeValidPayload({
        phone: intlPhone,
        startedAt: nowMs + 3600_000 - 10_000,
      }),
      "203.0.113.21",
      {
        nowMs: nowMs + 3600_000,
        sendEmailFn: failingEmailFn,
        founderEmail: "founder@wafrah.sa",
      },
    );

    expect(dup.ok).toBe(true);
    expect(dup.status).toBe(200);
    if (dup.ok) {
      expect(dup.deduplicated).toBe(true);
      expect(dup.leadId).toBe(first.ok ? first.leadId : undefined);
    }
    expect(failingEmailFn).toHaveBeenCalledTimes(2);
  });

  it("blocks non-admin roles from reading/updating leads and allows PLATFORM_ADMIN management + CSV export", async () => {
    const nowMs = 1_760_000_000_000;
    const uniqueSuffix = String(Math.floor(1000000 + Math.random() * 8999999));
    const sendEmailFn = vi.fn(async () => ({
      ok: true as const,
      mode: "console" as const,
      id: "mock-id",
    }));

    const created = await submitPilotLead(
      makeValidPayload({
        phone: `58${uniqueSuffix}`,
        city: "OTHER",
        cityOther: "Taif",
        email: "",
        branches: 8,
        startedAt: nowMs - 8000,
      }),
      "203.0.113.30",
      {
        nowMs,
        sendEmailFn,
        founderEmail: "founder@wafrah.sa",
      },
    );
    expect(created.ok).toBe(true);
    if (!created.ok || !created.leadId) {
      throw new Error("Expected lead creation");
    }
    createdLeadIds.push(created.leadId);
    expect(sendEmailFn).toHaveBeenCalledTimes(1);

    const getResponse = await leadRouteGet();
    expect(getResponse.status).toBe(405);

    for (const nonAdmin of [null, STAFF_USER, MANAGER_USER, OWNER_USER]) {
      await expect(listAdminLeads(nonAdmin)).rejects.toThrow(AuthorizationError);
      await expect(
        updateAdminLead(nonAdmin, created.leadId, { status: "CONTACTED" }),
      ).rejects.toThrow(AuthorizationError);
    }

    const realAdmin = await platformAdminDb.user.findFirstOrThrow({
      where: { role: "PLATFORM_ADMIN" },
      select: { id: true, name: true, locale: true },
    });
    const sessionAdmin: SessionUser = {
      userId: realAdmin.id,
      name: realAdmin.name,
      role: "PLATFORM_ADMIN",
      tenantId: null,
      locale: realAdmin.locale === "en" ? "en" : "ar",
    };

    const adminList = await listAdminLeads(sessionAdmin, {
      city: "OTHER",
      search: TEST_RUN_TAG,
    });
    expect(adminList.some((row) => row.id === created.leadId)).toBe(true);

    const updated = await updateAdminLead(sessionAdmin, created.leadId, {
      status: "PILOT",
      notes: "=SUM(1,1) Call scheduled Sunday",
    });
    expect(updated.status).toBe("PILOT");
    expect(updated.notes).toBe("=SUM(1,1) Call scheduled Sunday");

    const auditEntry = await platformAdminDb.auditLog.findFirst({
      where: {
        action: "ADMIN_LEAD_STATUS_UPDATED",
        entity: "Lead",
        entityId: created.leadId,
      },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry?.userId).toBe(realAdmin.id);

    const csv = buildLeadsCsv([updated], "en");
    expect(csv).toContain("Al-Balad Kitchen");
    expect(csv).toContain("Taif");
    expect(csv).toContain("'=SUM(1,1) Call scheduled Sunday");
  });
});
