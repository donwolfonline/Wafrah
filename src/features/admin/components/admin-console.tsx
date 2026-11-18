"use client";

import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import {
  Activity,
  Building2,
  ClipboardList,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AdminCustomerSummary,
  AdminLeadItem,
  AdminOverviewDto,
} from "../types";
import { AdminConsoleDialogs } from "./admin-console-dialogs";
import { AdminStats } from "./admin-stats";
import { AdoptionTab } from "./adoption-tab";
import { CustomersTable } from "./customers-table";
import { FeedbackTab } from "./feedback-tab";
import { HealthTab } from "./health-tab";
import { LeadsTab } from "./leads-tab";

interface AdminConsoleProps {
  initialOverview: AdminOverviewDto;
}

export function AdminConsole({ initialOverview }: AdminConsoleProps) {
  const t = useTranslations("admin");

  const [overview, setOverview] = useState<AdminOverviewDto>(initialOverview);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] =
    useState<AdminCustomerSummary | null>(null);
  const [diagnosticsCustomer, setDiagnosticsCustomer] =
    useState<AdminCustomerSummary | null>(null);
  const [deletingCustomer, setDeletingCustomer] =
    useState<AdminCustomerSummary | null>(null);
  const [pendingSuspendId, setPendingSuspendId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredCustomers = normalizedQuery
    ? overview.customers.filter((c) => {
        return (
          c.name.toLowerCase().includes(normalizedQuery) ||
          c.nameAr.toLowerCase().includes(normalizedQuery) ||
          c.code.toLowerCase().includes(normalizedQuery) ||
          c.city.toLowerCase().includes(normalizedQuery)
        );
      })
    : overview.customers;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/overview");
      const payload = (await response.json()) as Partial<AdminOverviewDto>;
      if (response.ok && payload.customers && payload.health) {
        setOverview((prev) => ({
          customers: payload.customers!,
          health: payload.health!,
          adoption: payload.adoption ?? prev.adoption,
          feedback: payload.feedback ?? prev.feedback,
          leads: payload.leads ?? prev.leads,
        }));
      }
    } finally {
      setRefreshing(false);
    }
  }

  function handleLeadUpdated(updated: AdminLeadItem) {
    setOverview((prev) => ({
      ...prev,
      leads: prev.leads.map((item) => (item.id === updated.id ? updated : item)),
    }));
  }

  function handleCustomerCreated(created: AdminCustomerSummary) {
    setOverview((prev) => ({
      ...prev,
      customers: [created, ...prev.customers],
    }));
  }

  function handleSubscriptionUpdated(
    restaurantId: string,
    patch: {
      plan: SubscriptionPlan;
      status: SubscriptionStatus;
      renewsAt: string | null;
    },
  ) {
    setOverview((prev) => ({
      ...prev,
      customers: prev.customers.map((c) =>
        c.id === restaurantId
          ? {
              ...c,
              plan: patch.plan,
              status: patch.status,
              renewsAt: patch.renewsAt,
            }
          : c,
      ),
    }));
  }

  function handleCustomerDeleted(restaurantId: string) {
    setOverview((prev) => ({
      ...prev,
      customers: prev.customers.filter((c) => c.id !== restaurantId),
    }));
  }

  async function handleToggleSuspension(customer: AdminCustomerSummary) {
    const action = customer.status === "SUSPENDED" ? "reactivate" : "suspend";
    setPendingSuspendId(customer.id);
    try {
      const response = await fetch(
        `/api/admin/restaurants/${customer.id}/suspend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        subscription?: {
          plan: SubscriptionPlan;
          status: SubscriptionStatus;
          renewsAt: string | null;
        };
      };

      if (!response.ok || !payload.subscription) {
        toast.error(payload.error || t("toasts.actionFailed"));
        return;
      }

      handleSubscriptionUpdated(customer.id, payload.subscription);
      toast.success(
        action === "suspend" ? t("toasts.suspended") : t("toasts.reactivated"),
      );
    } catch {
      toast.error(t("toasts.actionFailed"));
    } finally {
      setPendingSuspendId(null);
    }
  }

  return (
    <div
      data-testid="admin-console"
      className="mx-auto w-full max-w-7xl space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 text-start">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
            />
            <span>{t("actions.refresh")}</span>
          </Button>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            data-testid="open-create-restaurant"
            className="gap-1.5"
          >
            <Plus className="size-4" />
            <span>{t("actions.createRestaurant")}</span>
          </Button>
        </div>
      </div>

      <AdminStats overview={overview} />

      <Tabs defaultValue="customers" className="w-full space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 group-data-[orientation=horizontal]/tabs:h-auto sm:w-fit">
          <TabsTrigger
            value="customers"
            data-testid="tab-customers"
            className="gap-1.5"
          >
            <Building2 className="size-4" />
            <span>{t("tabs.customers")}</span>
          </TabsTrigger>
          <TabsTrigger
            value="adoption"
            data-testid="tab-adoption"
            className="gap-1.5"
          >
            <TrendingUp className="size-4" />
            <span>{t("tabs.adoption")}</span>
            {overview.adoption.some((row) => row.noEntriesIn3Days) ? (
              <Badge
                variant="secondary"
                className="bg-amber-100 px-1.5 py-0 text-[10px] text-amber-900"
              >
                {overview.adoption.filter((row) => row.noEntriesIn3Days).length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="feedback"
            data-testid="tab-feedback"
            className="gap-1.5"
          >
            <MessageSquareText className="size-4" />
            <span>{t("tabs.feedback")}</span>
            {overview.feedback.length > 0 ? (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {overview.feedback.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="leads"
            data-testid="tab-leads"
            className="gap-1.5"
          >
            <ClipboardList className="size-4" />
            <span>{t("tabs.leads")}</span>
            {overview.leads.filter((item) => item.status === "NEW").length > 0 ? (
              <Badge variant="secondary" className="ms-1 px-1.5 py-0 text-xs">
                {overview.leads.filter((item) => item.status === "NEW").length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="health"
            data-testid="tab-health"
            className="gap-1.5"
          >
            <Activity className="size-4" />
            <span>{t("tabs.health")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("table.searchPlaceholder")}
              className="ps-9 text-start"
            />
          </div>

          <CustomersTable
            customers={filteredCustomers}
            pendingSuspendId={pendingSuspendId}
            onEditSubscription={setEditingCustomer}
            onToggleSuspension={handleToggleSuspension}
            onOpenDiagnostics={setDiagnosticsCustomer}
            onRequestDelete={setDeletingCustomer}
          />
        </TabsContent>

        <TabsContent value="adoption">
          <AdoptionTab rows={overview.adoption} />
        </TabsContent>

        <TabsContent value="feedback">
          <FeedbackTab
            items={overview.feedback}
            customers={overview.customers}
          />
        </TabsContent>

        <TabsContent value="leads">
          <LeadsTab leads={overview.leads} onLeadUpdated={handleLeadUpdated} />
        </TabsContent>

        <TabsContent value="health">
          <HealthTab health={overview.health} />
        </TabsContent>
      </Tabs>

      <AdminConsoleDialogs
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
        onCreated={handleCustomerCreated}
        editingCustomer={editingCustomer}
        onClearEditingCustomer={() => setEditingCustomer(null)}
        onUpdated={handleSubscriptionUpdated}
        diagnosticsCustomer={diagnosticsCustomer}
        onClearDiagnosticsCustomer={() => setDiagnosticsCustomer(null)}
        deletingCustomer={deletingCustomer}
        onClearDeletingCustomer={() => setDeletingCustomer(null)}
        onDeleted={handleCustomerDeleted}
      />
    </div>
  );
}
