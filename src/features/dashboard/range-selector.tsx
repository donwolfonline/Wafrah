"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardRangeDays } from "./types";

const RANGE_OPTIONS: readonly DashboardRangeDays[] = [7, 30, 90];

interface RangeSelectorProps {
  value: DashboardRangeDays;
}

export function RangeSelector({ value }: RangeSelectorProps) {
  const router = useRouter();
  const t = useTranslations("dashboard");
  const [isPending, startTransition] = useTransition();

  function selectRange(days: DashboardRangeDays) {
    if (days === value) return;
    startTransition(() => {
      router.push(`/dashboard?range=${days}`);
    });
  }

  return (
    <div
      role="group"
      aria-label={t("rangeSelectorLabel")}
      data-testid="dashboard-range-selector"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-lg border bg-card p-1",
        isPending && "opacity-75",
      )}
    >
      {RANGE_OPTIONS.map((days) => {
        const active = value === days;
        return (
          <Button
            key={days}
            type="button"
            size="sm"
            variant={active ? "default" : "ghost"}
            aria-pressed={active}
            disabled={isPending}
            data-testid={`range-btn-${days}`}
            onClick={() => selectRange(days)}
            className="whitespace-nowrap px-2.5 text-xs sm:px-3 sm:text-sm"
          >
            {t(`ranges.${days}`)}
          </Button>
        );
      })}
    </div>
  );
}
