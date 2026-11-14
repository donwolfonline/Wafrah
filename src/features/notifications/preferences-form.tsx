"use client";

import { AlertTriangle, Mail, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { NotificationPreferencesDto } from "./types";

interface NotificationPreferencesFormProps {
  initialEmail: string | null;
  initialPreferences: NotificationPreferencesDto;
}

const PREFERENCE_KEYS: Array<keyof NotificationPreferencesDto> = [
  "criticalAlerts",
  "weeklySummary",
  "monthlyReport",
];

export function NotificationPreferencesForm({
  initialEmail,
  initialPreferences,
}: NotificationPreferencesFormProps) {
  const router = useRouter();
  const t = useTranslations("notifications.settings");

  const [savedPrefs, setSavedPrefs] =
    useState<NotificationPreferencesDto>(initialPreferences);
  const [prefs, setPrefs] =
    useState<NotificationPreferencesDto>(initialPreferences);
  const [saving, setSaving] = useState(false);

  const hasChanges = PREFERENCE_KEYS.some(
    (key) => prefs[key] !== savedPrefs[key],
  );

  function toggleKey(key: keyof NotificationPreferencesDto) {
    setPrefs((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        preferences?: NotificationPreferencesDto;
      } | null;

      if (!response.ok || !payload?.preferences) {
        throw new Error(payload?.error || t("errorToast"));
      }

      setPrefs(payload.preferences);
      setSavedPrefs(payload.preferences);
      toast.success(t("savedToast"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorToast"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-start">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Mail className="h-4 w-4 text-primary" />
              <span>{t("emailAddressLabel")}</span>
            </CardTitle>
            <CardDescription className="font-mono text-xs sm:text-sm" dir="ltr">
              {initialEmail && initialEmail.trim()
                ? initialEmail
                : t("noEmailWarning")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        {(!initialEmail || !initialEmail.trim()) && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-start">{t("noEmailWarning")}</p>
          </div>
        )}

        <div className="divide-y divide-border/60 rounded-lg border border-border/70">
          {PREFERENCE_KEYS.map((key) => {
            const labelId = `pref-label-${key}`;
            const descId = `pref-desc-${key}`;
            const checked = prefs[key];

            return (
              <div
                key={key}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="space-y-1 text-start">
                  <div id={labelId} className="text-sm font-medium">
                    {t(`items.${key}.title`)}
                  </div>
                  <p id={descId} className="text-xs text-muted-foreground">
                    {t(`items.${key}.description`)}
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  aria-labelledby={labelId}
                  aria-describedby={descId}
                  disabled={saving}
                  data-testid={`toggle-${key}`}
                  onClick={() => toggleKey(key)}
                  className={cn(
                    "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    checked
                      ? "justify-end bg-primary"
                      : "justify-start bg-muted-foreground/30",
                  )}
                >
                  <span className="h-5 w-5 rounded-full bg-background shadow-sm" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            disabled={saving || !hasChanges}
            onClick={() => void handleSave()}
            data-testid="save-notification-preferences"
          >
            <Save className="me-2 h-4 w-4" />
            {saving ? t("savingButton") : t("saveButton")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
