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
    <TableRow data-testid={`lead-row-${lead.id}`}>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatGregorianDate(lead.createdAt, locale, {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </TableCell>
      <TableCell className="min-w-[180px] text-start text-sm">
        <div className="font-semibold">{lead.name}</div>
        <div className="text-xs text-muted-foreground">{lead.role}</div>
        <div dir="ltr" className="mt-0.5 text-start font-mono text-xs">
          {lead.phone}
        </div>
        <div className="text-xs text-muted-foreground">
          {lead.email ?? t("noEmail")}
        </div>
      </TableCell>
      <TableCell className="min-w-[150px] text-start text-sm">
        <div className="font-medium">{lead.businessName}</div>
        <div className="text-xs text-muted-foreground">
          {t("columns.branches")}: {formatNumber(lead.branches, locale)}
        </div>
        {utm ? (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{utm}</div>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap text-start text-sm">
        {cityDisplay}
      </TableCell>
      <TableCell className="whitespace-nowrap text-start text-sm">
        {t(`posSystems.${lead.posSystem}`)}
      </TableCell>
      <TableCell className="min-w-[140px]">
        <Select
          value={lead.status}
          disabled={saving}
          onValueChange={(next) => onStatusChange(lead.id, next as LeadStatusValue)}
        >
          <SelectTrigger
            className={`h-8 text-xs font-semibold ${STATUS_BADGE_CLASS[lead.status]}`}
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
      <TableCell className="min-w-[220px]">
        <div className="flex items-center gap-1.5">
          <Input
            value={currentNotes}
            placeholder={t("notesPlaceholder")}
            className="h-8 text-xs"
            disabled={saving}
            data-testid={`lead-notes-${lead.id}`}
            onChange={(e) => onNotesDraftChange(lead.id, e.target.value)}
          />
          {notesDirty ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-8 shrink-0 px-2.5 text-xs"
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
