"use client";

import { Download, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LEAD_CITY_VALUES,
  LEAD_STATUS_VALUES,
  type LeadStatusValue,
} from "@/features/leads/schema";
import { formatNumber } from "@/lib/format";
import type { AdminLeadItem } from "../types";
import { LeadTableRow } from "./lead-table-row";

interface LeadsTabProps {
  leads: AdminLeadItem[];
  onLeadUpdated: (updated: AdminLeadItem) => void;
}

export function LeadsTab({ leads, onLeadUpdated }: LeadsTabProps) {
  const t = useTranslations("admin.leads");
  const locale = useLocale() === "en" ? "en" : "ar";

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [cityFilter, setCityFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== "ALL" && lead.status !== statusFilter) return false;
      if (cityFilter !== "ALL" && lead.city !== cityFilter) return false;
      if (!q) return true;
      return (
        lead.name.toLowerCase().includes(q) ||
        lead.businessName.toLowerCase().includes(q) ||
        lead.phone.toLowerCase().includes(q) ||
        (lead.email?.toLowerCase().includes(q) ?? false) ||
        (lead.cityOther?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [leads, statusFilter, cityFilter, searchQuery]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ locale });
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (cityFilter !== "ALL") params.set("city", cityFilter);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    return `/api/admin/leads/export?${params.toString()}`;
  }, [locale, statusFilter, cityFilter, searchQuery]);

  async function patchLead(
    leadId: string,
    body: { status?: LeadStatusValue; notes?: string | null },
  ) {
    setSavingId(leadId);
    try {
      const response = await fetch(`/api/admin/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        lead?: AdminLeadItem;
        error?: string;
      };
      if (!response.ok || !payload.lead) {
        toast.error(payload.error ?? t("updateErrorToast"));
        return;
      }
      onLeadUpdated(payload.lead);
      setNotesDrafts((prev) => {
        const next = { ...prev };
        delete next[leadId];
        return next;
      });
      toast.success(t("updatedToast"));
    } catch {
      toast.error(t("updateErrorToast"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-start">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{t("title")}</CardTitle>
            <Badge variant="secondary">
              {t("countLabel", {
                count: formatNumber(filteredLeads.length, locale),
              })}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <Button asChild variant="outline" size="sm" className="gap-1.5 self-start sm:self-auto">
          <a href={exportHref} download>
            <Download className="size-4" />
            <span>{t("exportCsv")}</span>
          </a>
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="ps-9"
              data-testid="leads-search-input"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="leads-status-filter" aria-label={t("statusFilterLabel")}>
              <SelectValue placeholder={t("statusFilterLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allStatuses")}</SelectItem>
              {LEAD_STATUS_VALUES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`statuses.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger data-testid="leads-city-filter" aria-label={t("cityFilterLabel")}>
              <SelectValue placeholder={t("cityFilterLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allCities")}</SelectItem>
              {LEAD_CITY_VALUES.map((city) => (
                <SelectItem key={city} value={city}>
                  {t(`cities.${city}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <div className="md:overflow-x-auto md:rounded-lg md:border">
            <Table className="block md:table">
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead className="text-start">{t("columns.createdAt")}</TableHead>
                  <TableHead className="text-start">{t("columns.contact")}</TableHead>
                  <TableHead className="text-start">{t("columns.business")}</TableHead>
                  <TableHead className="text-start">{t("columns.city")}</TableHead>
                  <TableHead className="text-start">{t("columns.posSystem")}</TableHead>
                  <TableHead className="text-start">{t("columns.status")}</TableHead>
                  <TableHead className="text-start">{t("columns.notes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="block space-y-3 md:table-row-group md:space-y-0">
                {filteredLeads.map((lead) => (
                  <LeadTableRow
                    key={lead.id}
                    lead={lead}
                    locale={locale}
                    notesDraft={notesDrafts[lead.id]}
                    saving={savingId === lead.id}
                    t={(key) => t(key)}
                    onStatusChange={(id, next) => void patchLead(id, { status: next })}
                    onNotesDraftChange={(id, value) =>
                      setNotesDrafts((prev) => ({ ...prev, [id]: value }))
                    }
                    onSaveNotes={(id, notes) => void patchLead(id, { notes })}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
