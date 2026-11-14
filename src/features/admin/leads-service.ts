import type { Prisma } from "@prisma/client";
import { createTranslator } from "next-intl";
import {
  adminLeadFilterSchema,
  adminLeadUpdateSchema,
  type LeadCityValue,
  type LeadPosValue,
  type LeadStatusValue,
} from "@/features/leads/schema";
import { getMessagesForLocale } from "@/features/notifications/template-layout";
import { recordAuditLog } from "@/lib/audit";
import { requireRole, type SessionUser } from "@/lib/authz";
import { buildCsvString } from "@/lib/csv";
import { formatGregorianDate, type SupportedLocale } from "@/lib/format";
import { getPlatformAdminDb, type platformAdminDb } from "@/lib/tenant";
import type { AdminLeadItem } from "./types";

export class LeadAdminError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "LeadAdminError";
    this.statusCode = statusCode;
  }
}

interface LeadRowLike {
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
  locale: string;
  consent: boolean;
  consentAt: Date;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  status: LeadStatusValue;
  notes: string | null;
  createdAt: Date;
}

export function mapLeadRowToDto(row: LeadRowLike): AdminLeadItem {
  return {
    id: row.id,
    name: row.name,
    businessName: row.businessName,
    city: row.city,
    cityOther: row.cityOther,
    role: row.role,
    phone: row.phone,
    email: row.email,
    branches: row.branches,
    posSystem: row.posSystem,
    locale: row.locale === "en" ? "en" : "ar",
    consent: row.consent,
    consentAt: row.consentAt.toISOString(),
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAdminLeads(
  actor?: SessionUser | null,
  rawFilters?: unknown,
  dbOverride?: typeof platformAdminDb,
): Promise<AdminLeadItem[]> {
  const admin = await requireRole("admin.*", actor);
  const db = dbOverride ?? (await getPlatformAdminDb(admin));

  const parsedFilters = adminLeadFilterSchema.safeParse(rawFilters ?? {});
  if (!parsedFilters.success) {
    throw new LeadAdminError("Invalid lead filter parameters", 400);
  }

  const { status, city, search } = parsedFilters.data;
  const where: Prisma.LeadWhereInput = {};
  if (status) {
    where.status = status;
  }
  if (city) {
    where.city = city;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { businessName: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { cityOther: { contains: search, mode: "insensitive" } },
      { role: { contains: search, mode: "insensitive" } },
    ];
  }

  const rows = await db.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return rows.map(mapLeadRowToDto);
}

export async function updateAdminLead(
  actor: SessionUser | null | undefined,
  leadId: string,
  rawInput: unknown,
  dbOverride?: typeof platformAdminDb,
): Promise<AdminLeadItem> {
  const admin = await requireRole("admin.*", actor);
  const db = dbOverride ?? (await getPlatformAdminDb(admin));

  const trimmedId = leadId.trim();
  if (!trimmedId) {
    throw new LeadAdminError("Lead ID is required", 400);
  }

  const parsed = adminLeadUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new LeadAdminError(
      parsed.error.issues[0]?.message ?? "Invalid lead update payload",
      400,
    );
  }

  const existing = await db.lead.findUnique({
    where: { id: trimmedId },
  });
  if (!existing) {
    throw new LeadAdminError("Lead not found", 404);
  }

  const data: Prisma.LeadUpdateInput = {};
  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status;
  }
  if (parsed.data.notes !== undefined) {
    data.notes = parsed.data.notes;
  }

  const updated = await db.lead.update({
    where: { id: existing.id },
    data,
  });

  await recordAuditLog({
    tenantId: null,
    userId: admin.userId,
    action: "ADMIN_LEAD_STATUS_UPDATED",
    entity: "Lead",
    entityId: updated.id,
    metadata: {
      previousStatus: existing.status,
      nextStatus: updated.status,
      statusChanged: existing.status !== updated.status,
      notesUpdated:
        parsed.data.notes !== undefined && parsed.data.notes !== existing.notes,
    },
  });

  return mapLeadRowToDto(updated);
}

export function buildLeadsCsv(
  leads: readonly AdminLeadItem[],
  locale: SupportedLocale = "en",
): string {
  const messages = getMessagesForLocale(locale);
  const t = createTranslator({
    locale,
    messages,
    namespace: "admin.leads",
  });

  const headers = [
    t("columns.createdAt"),
    t("columns.contact"),
    t("columns.business"),
    t("columns.city"),
    t("columns.branches"),
    t("columns.posSystem"),
    t("columns.status"),
    t("columns.source"),
    t("columns.notes"),
  ];

  const rows = leads.map((lead) => {
    const cityName =
      lead.city === "OTHER" && lead.cityOther
        ? `${t(`cities.${lead.city}`)} (${lead.cityOther})`
        : t(`cities.${lead.city}`);
    const contactSummary = [lead.name, lead.role, lead.phone, lead.email]
      .filter(Boolean)
      .join(" | ");
    const utmSummary = [lead.utmSource, lead.utmMedium, lead.utmCampaign]
      .filter(Boolean)
      .join(" / ");
    const submittedRiyadh = formatGregorianDate(lead.createdAt, locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    return [
      submittedRiyadh,
      contactSummary,
      lead.businessName,
      cityName,
      String(lead.branches),
      t(`posSystems.${lead.posSystem}`),
      t(`statuses.${lead.status}`),
      utmSummary,
      lead.notes ?? "",
    ];
  });

  return buildCsvString(headers, rows);
}
