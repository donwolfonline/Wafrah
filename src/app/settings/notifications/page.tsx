import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { redirect } from "next/navigation";
import { createTranslator } from "next-intl";
import { AppShell } from "@/components/shell/app-shell";
import { SettingsTabs } from "@/components/shell/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { getServerSessionUser } from "@/features/auth/session";
import { getNotificationPreferencesForUser } from "@/features/notifications";
import { NotificationPreferencesForm } from "@/features/notifications/preferences-form";
import { ExportDataCard } from "@/features/privacy/export-data-card";
import { getAppLocale, getAppMessages } from "@/i18n/request";
import {
  AuthorizationError,
  getRoleHomePath,
  requireRole,
  type SessionUser,
} from "@/lib/authz";
import { NOINDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NOINDEX_METADATA;
export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) {
    redirect("/login");
  }

  let user: SessionUser;
  try {
    user = await requireRole(["MANAGER", "OWNER"], sessionUser);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect(getRoleHomePath(sessionUser.role));
    }
    throw error;
  }

  const [{ email, preferences }, locale, messages] = await Promise.all([
    getNotificationPreferencesForUser(user),
    getAppLocale(),
    getAppMessages(),
  ]);

  const t = createTranslator({
    locale,
    messages,
    namespace: "notifications.settings",
  });

  return (
    <AppShell variant="manager" user={user}>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <SettingsTabs activeTab="notifications" />
        <div className="space-y-2 text-start">
          <Badge variant="outline" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            <span>{t("badge")}</span>
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <NotificationPreferencesForm
          initialEmail={email}
          initialPreferences={preferences}
        />

        <ExportDataCard />
      </div>
    </AppShell>
  );
}
