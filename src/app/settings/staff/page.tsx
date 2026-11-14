import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { env } from "@/env";
import { AppShell } from "@/components/shell/app-shell";
import { SettingsTabs } from "@/components/shell/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { getServerSessionUser } from "@/features/auth/session";
import { listStaffForTenant } from "@/features/staff";
import { StaffManager } from "@/features/staff/components/staff-manager";
import { getAppTranslations } from "@/i18n/request";
import {
  AuthorizationError,
  getRoleHomePath,
  requireRole,
  type SessionUser,
} from "@/lib/authz";
import { NOINDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NOINDEX_METADATA;
export const dynamic = "force-dynamic";

async function resolveOrigin(): Promise<string> {
  const configured =
    env.APP_URL ??
    env.NEXT_PUBLIC_APP_URL ??
    env.AUTH_URL ??
    "";
  const trimmed = configured.trim().replace(/\/+$/, "");

  try {
    const reqHeaders = await headers();
    const host = reqHeaders.get("x-forwarded-host") ?? reqHeaders.get("host");
    if (host) {
      const proto =
        reqHeaders.get("x-forwarded-proto") ??
        (host.startsWith("localhost") || host.startsWith("127.0.0.1")
          ? "http"
          : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // Fall back to environment configuration when headers() is unavailable
  }

  return trimmed;
}

export default async function StaffSettingsPage() {
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

  const [data, t, tNav, initialOrigin] = await Promise.all([
    listStaffForTenant(user),
    getAppTranslations("staff"),
    getAppTranslations("nav"),
    resolveOrigin(),
  ]);

  return (
    <AppShell variant="manager" user={user}>
      <div className="mx-auto w-full max-w-4xl space-y-6 print:max-w-none print:space-y-0">
        <div className="space-y-4 print:hidden">
          <SettingsTabs activeTab="staff" />
          <div className="space-y-2 text-start">
            <Badge variant="outline" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              <span>{tNav("staff")}</span>
            </Badge>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>

        <StaffManager initialData={data} initialOrigin={initialOrigin} />
      </div>
    </AppShell>
  );
}
