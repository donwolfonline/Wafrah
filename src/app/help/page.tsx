import Link from "next/link";
import {
  ArrowLeft,
  Calculator,
  CircleHelp,
  Mail,
  MessageCircle,
  Phone,
  UtensilsCrossed,
  WifiOff,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSessionUser } from "@/features/auth/session";
import { getAppTranslations } from "@/i18n/request";
import { getRoleHomePath } from "@/lib/authz";
import { getSupportContactConfig } from "@/lib/support-config";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const [user, t, tNav] = await Promise.all([
    getServerSessionUser(),
    getAppTranslations("help"),
    getAppTranslations("nav"),
  ]);
  const support = getSupportContactConfig();
  const hasAnyContact = Boolean(
    support.contactName ||
      support.contactEmail ||
      support.contactPhone ||
      support.whatsappUrl,
  );

  const shellVariant = user
    ? user.role === "STAFF"
      ? "kitchen"
      : "manager"
    : "auth";
  const backHref = user ? getRoleHomePath(user.role) : "/login";

  return (
    <AppShell variant={shellVariant} user={user}>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2 text-start">
            <Badge variant="outline" className="gap-1.5">
              <CircleHelp className="size-3.5" />
              <span>{tNav("help")}</span>
            </Badge>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={backHref}>
              <ArrowLeft className="size-4 rtl-flip" />
              <span>{t("backToApp")}</span>
            </Link>
          </Button>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UtensilsCrossed className="size-4 text-primary" />
                <span>{t("q1Title")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("q1Body")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <WifiOff className="size-4 text-primary" />
                <span>{t("q2Title")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("q2Body")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator className="size-4 text-primary" />
                <span>{t("q3Title")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("q3Body")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="size-4 text-primary" />
                <span>{t("q4Title")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasAnyContact ? (
                <dl className="space-y-2.5 text-sm">
                  {support.contactName ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <dt className="text-muted-foreground">
                        {t("contactNameLabel")}
                      </dt>
                      <dd className="font-medium">{support.contactName}</dd>
                    </div>
                  ) : null}
                  {support.contactEmail ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="size-4" />
                        <span>{t("contactEmailLabel")}</span>
                      </dt>
                      <dd>
                        <a
                          dir="ltr"
                          href={`mailto:${support.contactEmail}`}
                          className="font-mono text-primary underline underline-offset-4"
                        >
                          {support.contactEmail}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  {support.contactPhone ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="size-4" />
                        <span>{t("contactPhoneLabel")}</span>
                      </dt>
                      <dd>
                        <a
                          dir="ltr"
                          href={`tel:${support.contactPhone}`}
                          className="font-mono text-primary underline underline-offset-4"
                        >
                          {support.contactPhone}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  {support.whatsappUrl ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <dt className="text-muted-foreground">
                        {t("contactWhatsappLabel")}
                      </dt>
                      <dd>
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={support.whatsappUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t("openWhatsapp")}
                          </a>
                        </Button>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("q4Unconfigured")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
