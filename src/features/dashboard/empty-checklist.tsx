import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAppTranslations } from "@/i18n/request";
import { cn } from "@/lib/utils";
import type { OnboardingChecklist } from "./types";

interface EmptyChecklistProps {
  checklist: OnboardingChecklist;
}

export async function EmptyChecklist({ checklist }: EmptyChecklistProps) {
  const t = await getAppTranslations("dashboard");

  const steps: Array<{
    key: string;
    done: boolean;
    title: string;
    href?: string;
    cta?: string;
    hint?: string;
  }> = [
    {
      key: "menu",
      done: checklist.hasMenuItems,
      title: t("checklist.stepMenuTitle"),
      href: "/menu",
      cta: t("checklist.stepMenuCta"),
    },
    {
      key: "staff",
      done: checklist.hasKitchenStaff,
      title: t("checklist.stepStaffTitle"),
      href: "/settings/staff",
      cta: t("checklist.stepStaffCta"),
    },
    {
      key: "imports",
      done: checklist.hasSalesHistory,
      title: t("checklist.stepImportsTitle"),
      href: "/imports",
      cta: t("checklist.stepImportsCta"),
    },
    {
      key: "waste",
      done: checklist.hasWasteEntries,
      title: t("checklist.stepWasteTitle"),
      href: "/log",
      cta: t("checklist.stepWasteCta"),
    },
    {
      key: "insights",
      done: checklist.hasInsightsReady,
      title: t("checklist.stepInsightsTitle"),
      hint: t("checklist.stepInsightsPending"),
    },
  ];

  return (
    <Card
      data-testid="dashboard-onboarding-checklist"
      className="border-primary/30 bg-primary/5"
    >
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-lg">{t("checklist.title")}</CardTitle>
          <CardDescription>{t("checklist.description")}</CardDescription>
        </div>
        <Badge
          variant="secondary"
          className="w-fit shrink-0 border-primary/20 bg-card font-medium"
        >
          {t("checklist.progressSummary", {
            completed: checklist.completedCount,
            total: checklist.totalCount,
          })}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {steps.map((step) => (
          <div
            key={step.key}
            className={cn(
              "flex flex-col justify-between gap-3 rounded-lg border bg-card p-4",
              step.done && "border-primary/30 bg-primary/[0.03]",
            )}
          >
            <div className="flex items-start gap-2.5">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 text-sm font-medium">{step.title}</div>
            </div>
            {step.done ? (
              <span className="text-xs font-medium text-primary">
                {t("checklist.completed")}
              </span>
            ) : step.href && step.cta ? (
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link href={step.href}>{step.cta}</Link>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {step.hint ?? t("checklist.pending")}
              </span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
