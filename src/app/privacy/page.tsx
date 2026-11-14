import type { Metadata } from "next";
import { UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NOINDEX_PLACEHOLDER_METADATA } from "@/lib/seo";

export const metadata: Metadata = NOINDEX_PLACEHOLDER_METADATA;

export default async function PrivacyPage() {
  const [t, tLegal, tApp] = await Promise.all([
    getTranslations("privacy"),
    getTranslations("legalPage"),
    getTranslations("app"),
  ]);

  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <Link href="/login" className="flex items-center gap-2.5 text-start">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
              <UtensilsCrossed className="size-5 text-accent" />
            </span>
            <span className="text-base font-bold">{tApp("logoText")}</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/login"
              className="text-sm font-medium text-primary hover:underline"
            >
              {tLegal("backToLogin")}
            </Link>
          </div>
        </header>

        <Card>
          <CardHeader className="text-start">
            <CardTitle className="text-2xl font-bold">{t("title")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("lastUpdated")}</p>
          </CardHeader>
          <CardContent className="space-y-6 text-start">
            <div
              data-testid="legal-placeholder-banner"
              className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-950 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100"
            >
              <p className="font-mono text-sm font-semibold">
                {t("placeholder")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4 text-sm text-muted-foreground">
              <Link href="/terms" className="text-primary hover:underline">
                {tLegal("viewTerms")}
              </Link>
              <Link href="/login" className="text-primary hover:underline">
                {tLegal("backToLogin")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
