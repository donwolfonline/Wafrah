"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StaffMemberDto, StaffPageData } from "../schemas";
import { PinRevealDialog, type PinRevelationState } from "./pin-reveal-dialog";
import { QuickStartCard } from "./quick-start-card";
import { StaffTable } from "./staff-table";

interface StaffManagerProps {
  initialData: StaffPageData;
  initialOrigin: string;
}

export function StaffManager({
  initialData,
  initialOrigin,
}: StaffManagerProps) {
  const t = useTranslations("staff");
  const [staff, setStaff] = useState<StaffMemberDto[]>(initialData.staff);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [busyStaffId, setBusyStaffId] = useState<string | null>(null);
  const [revelation, setRevelation] = useState<PinRevelationState | null>(null);

  const activeCount = staff.filter((m) => m.active).length;

  async function handleCreateStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim().toLowerCase(),
          locale,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        staff?: StaffMemberDto;
        generatedPin?: string;
        error?: string;
      };

      if (!response.ok || !payload.staff || !payload.generatedPin) {
        const msg = payload.error || t("errorToast");
        setFormError(msg);
        toast.error(msg);
        return;
      }

      const created = payload.staff;
      setStaff((prev) => [created, ...prev]);
      setName("");
      setUsername("");
      setRevelation({
        mode: "created",
        name: created.name,
        username: created.username,
        pin: payload.generatedPin,
      });
      toast.success(t("createdToast"));
    } catch {
      const msg = t("errorToast");
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPin(member: StaffMemberDto) {
    setBusyStaffId(member.id);
    try {
      const response = await fetch(`/api/staff/${member.id}/reset-pin`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        staff?: StaffMemberDto;
        generatedPin?: string;
        error?: string;
      };
      if (!response.ok || !payload.staff || !payload.generatedPin) {
        toast.error(payload.error || t("errorToast"));
        return;
      }
      const updated = payload.staff;
      setStaff((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setRevelation({
        mode: "reset",
        name: updated.name,
        username: updated.username,
        pin: payload.generatedPin,
      });
      toast.success(t("pinResetToast"));
    } catch {
      toast.error(t("errorToast"));
    } finally {
      setBusyStaffId(null);
    }
  }

  async function handleToggleActive(member: StaffMemberDto) {
    setBusyStaffId(member.id);
    const nextActive = !member.active;
    try {
      const response = await fetch(`/api/staff/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        staff?: StaffMemberDto;
        error?: string;
      };
      if (!response.ok || !payload.staff) {
        toast.error(payload.error || t("errorToast"));
        return;
      }
      const updated = payload.staff;
      setStaff((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      toast.success(
        nextActive ? t("reactivatedToast") : t("deactivatedToast"),
      );
    } catch {
      toast.error(t("errorToast"));
    } finally {
      setBusyStaffId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            <span>{t("addCardTitle")}</span>
          </CardTitle>
          <CardDescription>{t("addCardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateStaff} className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="staff-name">{t("nameLabel")}</Label>
              <Input
                id="staff-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
                required
                minLength={2}
                maxLength={80}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-username">{t("usernameLabel")}</Label>
              <Input
                id="staff-username"
                dir="ltr"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={t("usernamePlaceholder")}
                required
                minLength={2}
                maxLength={32}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {t("usernameHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-locale">{t("localeLabel")}</Label>
              <Select
                value={locale}
                onValueChange={(value) =>
                  setLocale(value === "en" ? "en" : "ar")
                }
              >
                <SelectTrigger id="staff-locale" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">{t("localeAr")}</SelectItem>
                  <SelectItem value="en">{t("localeEn")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formError ? (
              <p className="text-sm font-medium text-destructive sm:col-span-3">
                {formError}
              </p>
            ) : null}

            <div className="sm:col-span-3">
              <Button type="submit" disabled={submitting} className="gap-2">
                <UserPlus className="size-4" />
                <span>
                  {submitting ? t("creatingButton") : t("createButton")}
                </span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{t("directoryTitle")}</CardTitle>
          <Badge variant="secondary">
            {t("directoryCount", { active: activeCount, total: staff.length })}
          </Badge>
        </CardHeader>
        <CardContent>
          <StaffTable
            staff={staff}
            busyStaffId={busyStaffId}
            onResetPin={handleResetPin}
            onToggleActive={handleToggleActive}
          />
        </CardContent>
      </Card>

      <QuickStartCard
        restaurant={initialData.restaurant}
        loginPath={initialData.loginPath}
        origin={initialOrigin}
      />

      <PinRevealDialog
        revelation={revelation}
        onClose={() => setRevelation(null)}
      />
    </div>
  );
}
