import { UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type LegalDocumentNamespace = "privacy" | "terms";

type LegalSection = {
  heading: string;
  paragraphs?: string[];
  items?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedStrings(raw: unknown): string[] {
  if (!isRecord(raw)) {
    return [];
  }
  return Object.keys(raw)
    .sort()
    .map((key) => raw[key])
    .filter((value): value is string => typeof value === "string");
}

// Legal copy is stored as keyed objects (s01, p01, i01, ...) because
// next-intl message types do not allow arrays.
function parseSections(raw: unknown): LegalSection[] {
  if (!isRecord(raw)) {
    return [];
  }
  return Object.keys(raw)
    .sort()
    .flatMap((key) => {
      const section = raw[key];
      if (!isRecord(section) || typeof section.heading !== "string") {
        return [];
      }
      return [
        {
          heading: section.heading,
          paragraphs: sortedStrings(section.paragraphs),
          items: sortedStrings(section.items),
        },
      ];
    });
}

export async function LegalDocument({
  namespace,
}: {
  namespace: LegalDocumentNamespace;
}) {
  const [t, tLegal, tApp] = await Promise.all([
    getTranslations(namespace),
    getTranslations("legalPage"),
    getTranslations("app"),
  ]);
  const sections = parseSections(t.raw("sections"));
  const otherHref = namespace === "privacy" ? "/terms" : "/privacy";
  const otherLabel =
    namespace === "privacy" ? tLegal("viewTerms") : tLegal("viewPrivacy");

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
            <p className="text-sm text-muted-foreground">
              {t("lastUpdated")}
            </p>
          </CardHeader>
          <CardContent
            className="space-y-6 text-start"
            data-testid="legal-document"
          >
            <p className="text-sm leading-7 text-foreground">{t("intro")}</p>

            {sections.map((section) => (
              <section key={section.heading} className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">
                  {section.heading}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="text-sm leading-7 text-muted-foreground"
                  >
                    {paragraph}
                  </p>
                ))}
                {section.items && section.items.length > 0 ? (
                  <ul className="list-disc space-y-2 ps-6 text-sm leading-7 text-muted-foreground">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4 text-sm text-muted-foreground">
              <Link href={otherHref} className="text-primary hover:underline">
                {otherLabel}
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
