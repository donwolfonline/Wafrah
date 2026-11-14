"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setLocaleAction } from "@/i18n/actions";
import type { AppLocale } from "@/i18n/request";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  touchTarget?: boolean;
  className?: string;
}

export function LanguageSwitcher({
  touchTarget = false,
  className,
}: LanguageSwitcherProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const nextLocale: AppLocale = locale === "ar" ? "en" : "ar";
  const label = locale === "ar" ? t("english") : t("arabic");
  const ariaLabel =
    locale === "ar" ? t("switchToEnglish") : t("switchToArabic");

  function handleSwitchLocale() {
    startTransition(async () => {
      await setLocaleAction({ locale: nextLocale });
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={touchTarget ? "touch" : "sm"}
      onClick={handleSwitchLocale}
      disabled={isPending}
      aria-label={ariaLabel}
      data-testid="language-switcher"
      className={cn(
        "gap-1.5 border-primary/25 font-medium sm:gap-2",
        touchTarget ? "min-h-12 px-3 text-xs sm:px-4 sm:text-sm" : "min-h-9 px-3",
        className,
      )}
    >
      <Languages className="size-4 text-primary" />
      <span>{label}</span>
    </Button>
  );
}
