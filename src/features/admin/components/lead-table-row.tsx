"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { LEAD_STATUS_VALUES, type LeadStatusValue } from "@/features/leads/schema";
import { formatGregorianDate, formatNumber, type SupportedLocale } from "@/lib/format";
import type { AdminLeadItem } from "../types";

const STATUS_BADGE_CLASS: Record<LeadStatusValue, string> = {
  NEW: "bg-amber-100 text-amber-900 border-amber-300",
  CONTACTED: "bg-sky-100 text-sky-900 border-sky-300",
  PILOT: "bg-emerald-100 text-emerald-900 border-emerald-300",
  NOT_FIT: "bg-slate-100 text-slate-700 border-slate-300",
};

interface LeadTableRowProps {
  lead: AdminLeadItem;
  locale: SupportedLocale;
  notesDraft: string | undefined;
  saving: boolean;
  t: (key: string) => string;
  onStatusChange: (leadId: string, nextStatus: LeadStatusValue) => void;
  onNotesDraftChange: (leadId: string, value: string) => void;
  onSaveNotes: (leadId: string, notes: string) => void;
}

export function LeadTableRow({
  lead,
  locale,
  notesDraft,
  saving,
  t,
  onStatusChange,
  onNotesDraftChange,
  onSaveNotes,
}: LeadTableRowProps) {
  const currentNotes = notesDraft ?? lead.notes ?? "";
  const notesDirty =
    notesDraft !== undefined &&
    notesDraft.trim() !== (lead.notes ?? "").trim();
  const cityDisplay =
    lead.city === "OTHER" && lead.cityOther
      ? `${t(`cities.${lead.city}`)} (${lead.cityOther})`
      : t(`cities.${lead.city}`);
  const utm = [lead.utmSource, lead.utmMedium, lead.utmCampaign]
    .filter(Boolean)
    .join(" / ");

  return (
    <TableRow
      data-testid={`lead-row-${lead.id}`}
      className="block rounded-xl border bg-card p-3.5 shadow-2xs md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:p-0 md:shadow-none"
    >
      <TableCell className="flex items-center justify-between gap-2 px-0 py-1 whitespace-nowrap text-xs text-muted-foreground md:table-cell md:px-2 md:py-2">
        <span className="font-medium md:hidden">{t("columns.createdAt")}</span>
        <span>
          {formatGregorianDate(lead.createdAt, locale, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </TableCell>
      <TableCell className="block min-w-0 border-b border-border/60 px-0 py-2 text-start text-sm md:table-cell md:min-w-[180px] md:border-b-0 md:px-2">
        <div className="font-semibold">{lead.name}</div>
        <div className="text-xs text-muted-foreground">{lead.role}</div>
        <div dir="ltr" className="mt-0.5 text-start font-mono text-xs">
          {lead.phone}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {lead.email ?? t("noEmail")}
        </div>
      </TableCell>
      <TableCell className="block min-w-0 px-0 py-2 text-start text-sm md:table-cell md:min-w-[150px] md:px-2">
        <div className="font-medium">{lead.businessName}</div>
        <div className="text-xs text-muted-foreground">
          {t("columns.branches")}: {formatNumber(lead.branches, locale)}
        </div>
        {utm ? (
          <div className="mt-0.5 break-all text-[11px] text-muted-foreground">{utm}</div>
        ) : null}
      </TableCell>
      <TableCell className="flex items-center justify-between gap-2 px-0 py-1 whitespace-nowrap text-start text-sm md:table-cell md:px-2 md:py-2">
        <span className="text-xs font-medium text-muted-foreground md:hidden">
          {t("columns.city")}
        </span>
        <span>{cityDisplay}</span>
      </TableCell>
      <TableCell className="flex items-center justify-between gap-2 px-0 py-1 whitespace-nowrap text-start text-sm md:table-cell md:px-2 md:py-2">
        <span className="text-xs font-medium text-muted-foreground md:hidden">
          {t("columns.posSystem")}
        </span>
        <span>{t(`posSystems.${lead.posSystem}`)}</span>
      </TableCell>
      <TableCell className="block min-w-0 px-0 py-2 md:table-cell md:min-w-[140px] md:px-2">
        <Select
          value={lead.status}
          disabled={saving}
          onValueChange={(next) => onStatusChange(lead.id, next as LeadStatusValue)}
        >
          <SelectTrigger
            className={`h-9 w-full text-xs font-semibold md:h-8 ${STATUS_BADGE_CLASS[lead.status]}`}
            data-testid={`lead-status-${lead.id}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAD_STATUS_VALUES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`statuses.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="block min-w-0 px-0 pt-1 pb-0 md:table-cell md:min-w-[220px] md:px-2 md:py-2">
        <div className="flex items-center gap-1.5">
          <Input
            value={currentNotes}
            placeholder={t("notesPlaceholder")}
            className="h-9 text-base md:h-8 md:text-xs"
            disabled={saving}
            data-testid={`lead-notes-${lead.id}`}
            onChange={(e) => onNotesDraftChange(lead.id, e.target.value)}
          />
          {notesDirty ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-9 shrink-0 px-2.5 text-xs md:h-8"
              disabled={saving}
              onClick={() => onSaveNotes(lead.id, currentNotes)}
            >
              {saving ? t("saving") : t("saveNotes")}
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
