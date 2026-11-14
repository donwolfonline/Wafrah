"use client";

import { KeyRound, UserCheck, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatGregorianDate, type SupportedLocale } from "@/lib/format";
import type { StaffMemberDto } from "../schemas";

interface StaffTableProps {
  staff: StaffMemberDto[];
  busyStaffId: string | null;
  onResetPin: (member: StaffMemberDto) => void;
  onToggleActive: (member: StaffMemberDto) => void;
}

export function StaffTable({
  staff,
  busyStaffId,
  onResetPin,
  onToggleActive,
}: StaffTableProps) {
  const t = useTranslations("staff");
  const rawLocale = useLocale();
  const locale: SupportedLocale = rawLocale === "en" ? "en" : "ar";

  if (staff.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t("emptyDirectory")}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("colName")}</TableHead>
          <TableHead>{t("colUsername")}</TableHead>
          <TableHead>{t("colStatus")}</TableHead>
          <TableHead>{t("colLastLogin")}</TableHead>
          <TableHead className="text-end">{t("colActions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {staff.map((member) => {
          const isBusy = busyStaffId === member.id;
          return (
            <TableRow key={member.id} data-testid={`staff-row-${member.username}`}>
              <TableCell className="font-medium">{member.name}</TableCell>
              <TableCell>
                <span dir="ltr" className="font-mono text-xs">
                  {member.username}
                </span>
              </TableCell>
              <TableCell>
                <Badge
                  variant={member.active ? "secondary" : "outline"}
                  className={
                    member.active
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "text-muted-foreground"
                  }
                >
                  {member.active ? t("statusActive") : t("statusInactive")}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {member.lastLoginAt
                  ? formatGregorianDate(member.lastLoginAt, locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : t("neverLoggedIn")}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => onResetPin(member)}
                    className="gap-1.5"
                  >
                    <KeyRound className="size-3.5" />
                    <span>{t("resetPinButton")}</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={member.active ? "ghost" : "secondary"}
                    disabled={isBusy}
                    onClick={() => onToggleActive(member)}
                    className="gap-1.5"
                  >
                    {member.active ? (
                      <>
                        <UserX className="size-3.5 text-destructive" />
                        <span className="text-destructive">
                          {t("deactivateButton")}
                        </span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="size-3.5" />
                        <span>{t("reactivateButton")}</span>
                      </>
                    )}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
