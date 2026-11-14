import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getServerSessionUser } from "@/features/auth/session";
import {
  getDashboardDataForTenant,
  parseDashboardRange,
} from "@/features/dashboard";
import { AlertsPanel } from "@/features/dashboard/alerts-panel";
import { EmptyChecklist } from "@/features/dashboard/empty-checklist";
import { HeatmapReasonsGrid } from "@/features/dashboard/heatmap-reasons-grid";
import { KpiGrid } from "@/features/dashboard/kpi-grid";
import { RangeSelector } from "@/features/dashboard/range-selector";
import { RecommendationsTable } from "@/features/dashboard/recommendations-table";
import { WasteCharts } from "@/features/dashboard/waste-charts";
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

interface DashboardPageProps {
  searchParams: Promise<{ range?: string | string[] }>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
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

  const resolvedParams = await searchParams;
  const rawRange = Array.isArray(resolvedParams.range)
    ? resolvedParams.range[0]
    : resolvedParams.range;
  const rangeDays = parseDashboardRange(rawRange);

  const [data, t] = await Promise.all([
    getDashboardDataForTenant(user, { rangeDays }),
    getAppTranslations("dashboard"),
  ]);

  return (
    <AppShell variant="manager" user={user}>
      <div
        data-testid="manager-dashboard"
        data-server-load-ms={data.serverLoadMs}
        className="mx-auto w-full max-w-6xl space-y-6"
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="space-y-1 text-start">
            <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              {t("subtitle")}
            </p>
          </div>
          <RangeSelector value={data.rangeDays} />
        </div>

        {!data.checklist.isComplete ? (
          <EmptyChecklist checklist={data.checklist} />
        ) : null}

        <KpiGrid kpis={data.kpis} />

        <WasteCharts dailyTrend={data.dailyTrend} itemBars={data.itemBars} />

        <HeatmapReasonsGrid heatmap={data.heatmap} reasons={data.reasons} />

        <AlertsPanel initialAlerts={data.alerts} />

        <RecommendationsTable
          horizonDates={data.recommendations.horizonDates}
          items={data.recommendations.items}
        />
      </div>
    </AppShell>
  );
}
