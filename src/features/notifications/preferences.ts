import type { Role } from "@prisma/client";
import { z } from "zod";
import { getServerAppUrl } from "@/lib/app-url";
import { requireRole, type SessionUser } from "@/lib/authz";
import { sendEmail, type SendEmailOptions } from "@/lib/email";
import type { SupportedLocale } from "@/lib/format";
import { createTenantDb, getTenantDb } from "@/lib/tenant";
import { renderWelcomeEmail } from "./templates-account";
import type { NotificationPreferencesDto } from "./types";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesDto = {
  criticalAlerts: true,
  weeklySummary: true,
  monthlyReport: true,
};

export const NotificationPreferencesSchema = z.object({
  criticalAlerts: z.boolean(),
  weeklySummary: z.boolean(),
  monthlyReport: z.boolean(),
});

export class NotificationsValidationError extends Error {
  public readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "NotificationsValidationError";
  }
}

export type NotificationChannel = keyof NotificationPreferencesDto;

export interface RecipientWithPreference {
  userId: string;
  name: string;
  email: string | null;
  role: Role;
  locale: string;
  preference: Partial<NotificationPreferencesDto> | null;
}

export function resolveEffectivePreferences(
  pref?: Partial<NotificationPreferencesDto> | null,
): NotificationPreferencesDto {
  return {
    criticalAlerts: pref?.criticalAlerts ?? DEFAULT_NOTIFICATION_PREFERENCES.criticalAlerts,
    weeklySummary: pref?.weeklySummary ?? DEFAULT_NOTIFICATION_PREFERENCES.weeklySummary,
    monthlyReport: pref?.monthlyReport ?? DEFAULT_NOTIFICATION_PREFERENCES.monthlyReport,
  };
}

/** Pure filter respecting opt-out toggles while treating missing preferences as enabled. */
export function filterRecipientsByPreference(
  recipients: RecipientWithPreference[],
  channel: NotificationChannel,
): Array<{
  userId: string;
  name: string;
  email: string;
  role: Role;
  locale: SupportedLocale;
}> {
  return recipients
    .filter((r) => {
      if (!r.email || !r.email.trim()) return false;
      const effective = resolveEffectivePreferences(r.preference);
      return effective[channel];
    })
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      email: r.email!.trim(),
      role: r.role,
      locale: r.locale === "en" ? "en" : "ar",
    }));
}

export async function getNotificationPreferencesForUser(
  sessionUser: SessionUser,
): Promise<{
  email: string | null;
  preferences: NotificationPreferencesDto;
}> {
  const user = await requireRole(["MANAGER", "OWNER"], sessionUser);
  const db = await getTenantDb(user);

  const [dbUser, pref] = await Promise.all([
    db.user.findFirstOrThrow({
      where: { id: user.userId },
      select: { email: true },
    }),
    db.notificationPreference.findFirst({
      where: { userId: user.userId },
      select: {
        criticalAlerts: true,
        weeklySummary: true,
        monthlyReport: true,
      },
    }),
  ]);

  return {
    email: dbUser.email,
    preferences: resolveEffectivePreferences(pref),
  };
}

export async function updateNotificationPreferencesForUser(
  sessionUser: SessionUser,
  rawInput: unknown,
): Promise<NotificationPreferencesDto> {
  const user = await requireRole(["MANAGER", "OWNER"], sessionUser);
  const parsed = NotificationPreferencesSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new NotificationsValidationError(
      parsed.error.issues[0]?.message ?? "Invalid notification preferences",
    );
  }

  const db = await getTenantDb(user);
  const saved = await db.notificationPreference.upsert({
    where: { userId: user.userId },
    create: {
      tenantId: user.tenantId!,
      userId: user.userId,
      criticalAlerts: parsed.data.criticalAlerts,
      weeklySummary: parsed.data.weeklySummary,
      monthlyReport: parsed.data.monthlyReport,
    },
    update: {
      criticalAlerts: parsed.data.criticalAlerts,
      weeklySummary: parsed.data.weeklySummary,
      monthlyReport: parsed.data.monthlyReport,
    },
    select: {
      criticalAlerts: true,
      weeklySummary: true,
      monthlyReport: true,
    },
  });

  await db.auditLog.create({
    data: {
      tenantId: user.tenantId!,
      userId: user.userId,
      action: "NOTIFICATION_PREFERENCES_UPDATED",
      entity: "NotificationPreference",
      entityId: user.userId,
      metadata: saved,
    },
  });

  return saved;
}

export async function loadTenantManagerRecipients(
  tenantId: string,
  channel: NotificationChannel,
) {
  const db = createTenantDb(tenantId);
  const rows = await db.user.findMany({
    where: {
      role: { in: ["MANAGER", "OWNER"] },
      active: true,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      locale: true,
      notificationPreference: {
        select: {
          criticalAlerts: true,
          weeklySummary: true,
          monthlyReport: true,
        },
      },
    },
  });

  const mapped: RecipientWithPreference[] = rows.map((u) => ({
    userId: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    locale: u.locale,
    preference: u.notificationPreference,
  }));

  return filterRecipientsByPreference(mapped, channel);
}

export async function sendWelcomeEmailForUser(
  params: {
    email: string;
    name: string;
    locale: SupportedLocale;
    restaurantName: string;
    restaurantNameAr: string;
    branchCode: string;
    role: Role;
    appUrl?: string;
  },
  emailOptions?: SendEmailOptions,
) {
  const rendered = renderWelcomeEmail({
    locale: params.locale,
    recipientName: params.name,
    restaurantName: params.restaurantName,
    restaurantNameAr: params.restaurantNameAr,
    branchCode: params.branchCode,
    role: params.role,
    appUrl: getServerAppUrl(params.appUrl),
  });

  return sendEmail(
    params.email,
    rendered.subject,
    rendered.html,
    rendered.text,
    emailOptions,
  );
}
